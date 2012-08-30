var async   = require('async'),
    express = require('express'),
    util    = require('util'),
    fs      = require('fs'),
    mongo   = require('mongoskin'),
    sio     = require('socket.io'),
    _       = require('underscore');


// ids of admin clients
var client_id = 0;
// in memory hash table
var clients = {};

var admin_uids = {
  700650173: true,
  674656292: true
};
function is_admin(uid) {
  return _.has(admin_uids, uid);
}

// create an express webserver
var app = express.createServer(
  express.logger(),
  express.static(__dirname + '/public'),
  express.bodyParser(),
  express.cookieParser(),
  // set this to a secret value to encrypt session cookies
  express.session({ secret: process.env.SESSION_SECRET || 'secret123' }),
  require('faceplate').middleware({
    app_id: process.env.FACEBOOK_APP_ID,
    secret: process.env.FACEBOOK_SECRET,
    scope:  'user_website,user_work_history,publish_actions'
  })
);

app.set('view options', { layout:'layout.ejs' });

var io = sio.listen(app);

io.configure(function () {
  io.set("transports", ["xhr-polling"]);
  io.set("polling duration", 10);
  io.set("log level", 1);
});

// listen to the PORT given to us in the environment
var port = process.env.PORT || 3000;

app.listen(port, function() {
  console.log("Listening on " + port);
});

app.dynamicHelpers({
  'host': function(req, res) {
    return req.headers['host'];
  },
  'scheme': function(req, res) {
    req.headers['x-forwarded-proto'] || 'http'
  },
  'url': function(req, res) {
    return function(path) {
      return app.dynamicViewHelpers.scheme(req, res) + app.dynamicViewHelpers.url_no_scheme(path);
    }
  },
  'url_no_scheme': function(req, res) {
    return function(path) {
      return '://' + app.dynamicViewHelpers.host(req, res) + path;
    }
  },
});

// Connect to MongoDB

var ObjectID = mongo.ObjectID;
var mdb = mongo.db('mongodb://heroku_app7048839:6688psq65ef8lb46ps1grdbdjt@ds037407-a.mongolab.com:37407/heroku_app7048839');
var collection = mdb.collection('foodhack_submissions');
var ObjectID = mongo.ObjectID;

function render_page(req, res) {
  req.facebook.app(function(app) {
    req.facebook.me(function(user) {
      res.render('index.ejs', {
        req:       req,
        app:       app,
        user:      user,
        is_admin:  user && is_admin(user.id)
      });
    });
  });
}

function render_question_page(req, res) {
  res.render('question.ejs', {
    layout: false,
    req: req,
    app: app,
    q: req.param('q')
  });
}

function render_submit(req, res) {
  req.facebook.app(function(app) {
    req.facebook.me(function(user) {
      res.render('submit.ejs', {
        layout: false,
        req:       req,
        app:       app,
        user:      user,
        is_admin:  user && is_admin(user.id),
        p:         req.param('p')
      });
    });
  });
}

function render_admin(req, res) {
  req.facebook.app(function(app) {
    req.facebook.me(function(user) {
      if (user && is_admin(user.id)) {
        res.render('admin.ejs', {
          req:       req,
          app:       app,
          user:      user,
          is_admin:  is_admin(user.id)
        });
      } else {
        res.statusCode = 302;
        res.setHeader("Location", "/?m=error");
        res.end();
      }
    });
  });
}

function insertIntoAnswerDB(data) {
  data._id = new ObjectID(data.uid + data.question);
  collection.save(data);

  // notify admins
  _.each(clients, function(c, id) {
    if (c.socket && c.socket.is_admin) {
      c.socket.emit('submissions', [data]);
    }
  });
}

function getAllSubmissions(cb) {
  collection.find().toArray(cb);
}

function do_post_submit(req, res) {
  req.facebook.app(function(app) {
    req.facebook.me(function(user) {

      var data = {
        uid: user.id,
        name: user.name,
        question: req.param('question'),
        answer: req.param('answer')
      }

      insertIntoAnswerDB(data);

      res.statusCode = 302;
      res.setHeader("Location", "/?m=success&q=" + data.question);
      res.end();
    })
  });
}

app.get('/', render_page);

app.get('/submit', render_submit);
app.post('/submit', do_post_submit);

app.get('/question', render_question_page);

app.get('/admin', render_admin);


/* Socket Functions */

io.sockets.on('connection', function (socket) {
  
  client_id += 1;
  var id = client_id;
  socket.client_id = id;
  socket.is_admin = false;

  socket.on('register', function(data) {
    if (is_admin(data.uid)) {
      socket.is_admin = true;
    }
    clients[id] = {
      socket: socket
    };
  });

  socket.on('get_submissions', function() {
    if (socket.is_admin) {
      getAllSubmissions(function(err, submission_data) {
        socket.emit('submissions', submission_data);
      });
    }
  });

  socket.on('disconnect', function () {
    if (_.has(clients, socket.client_id)) {
      delete clients[socket.client_id];
    }
  });
});
