var async   = require('async'),
    express = require('express'),
    util    = require('util'),
    fs      = require('fs'),
    mongo   = require('mongoskin'),
    sio     = require('socket.io'),
    crypto =  require('crypto'),
    _       = require('underscore');


// ids of admin clients
var client_id = 0;
// in memory hash table
var clients = {};

var admin_uids = {
  700650173: true,
  674656292: true
};

var hashed_ids = {};
var hashes = {};

function hash_dat(uid) {
  var currentTime = new Date();
  var str = uid + process.env.SESSION_SECRET + currentTime.getTime();
  return crypto.createHash('md5').update(str).digest("hex").substr(0, 12);
}

function is_admin(uid) {
  return _.has(admin_uids, uid);
}
function is_admin_hash(hash) {
  return _.has(hashes, hash) && _.has(admin_uids, hashes[hash]);
}

function make_hashed_id(uid, admin) {
  if (_.has(hashed_ids, uid)) {
    return hashed_ids[uid];
  } else {
    var hash = hash_dat(uid);
    hashed_ids[uid] = hash;
    hashes[hash] = uid;
    return hash;
  }
}

_.each(admin_uids, function(uid) {
  hash_dat(uid, true);
});

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
    scope:  'user_website,user_work_history'
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

function render_page(req, res) {
  req.facebook.app(function(app) {
    req.facebook.me(function(user) {
      res.render('index.ejs', {
        req:       req,
        app:       app,
        user:      user,
        hash:      user && make_hashed_id(user.id, false),
        is_admin:  user && is_admin(user.id)
      });
    });
  });
}

function render_me(req, res) {
  req.facebook.app(function(app) {
    req.facebook.me(function(user) {
      res.render('me.ejs', {
        req:       req,
        app:       app,
        user:      user,
        hash:      user && make_hashed_id(user.id, false),
        is_admin:  user && is_admin(user.id)
      });
    });
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
        hash:      user && make_hashed_id(user.id, false),
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
          hash:      user && make_hashed_id(user.id, false),
          is_admin:  user && is_admin(user.id)
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
  var str = data.uid + data.question;
  var hash = crypto.createHash('md5').update(str).digest("hex").substr(0, 12);

  data._id = new ObjectID(hash);
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

function getMySubmissions(uid, cb) {
  collection.find({"uid": ""+uid+""}).toArray(cb);
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

app.get('/me', render_me);
app.get('/admin', render_admin);


/* Socket Functions, these can be exploited... whatever */

io.sockets.on('connection', function (socket) {
  
  client_id += 1;
  var id = client_id;
  socket.client_id = id;
  socket.is_admin = false;

  socket.on('register', function(data) {
    if (is_admin_hash(data.hid)) {
      socket.is_admin = true;
    }
    if (!_.has(hashes, data.hid)) {
      socket.server.close();
      return false;
    }
    socket.uid = hashes[data.hid];
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

  socket.on('get_my_submissions', function() {
    getMySubmissions(socket.uid, function(err, submission_data) {
      socket.emit('submissions', submission_data);
    });
  });

  socket.on('disconnect', function () {
    if (_.has(clients, socket.client_id)) {
      delete clients[socket.client_id];
    }
  });
});
