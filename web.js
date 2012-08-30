var async   = require('async'),
    express = require('express'),
    util    = require('util'),
    fs      = require('fs'),
    mongo   = require('mongoskin');

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
        user:      user
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
        p:         req.param('p')
      });
    });
  });
}

var ObjectID = mongo.ObjectID;

function insert_into_answer_db(data) {
  data._id = new ObjectID(data.uid + data.question);
  collection.save(data);
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

      insert_into_answer_db(data);

      res.statusCode = 302;
      res.setHeader("Location", "/?m=success&q=" + data.question);
      res.end();
    })
  });
}

app.get('/', render_page);

app.get('/submit', render_submit);
app.post('/submit', do_post_submit);
