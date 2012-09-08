Facebook Foodhack
=================

This app was used for the Facebook Foodhack event at Cornell University. http://foodhack.herokuapp.com

Run locally
-----------

Install dependencies:

    npm bundle install

[Create a dev app on Facebook](https://developers.facebook.com/apps) and set the Website URL to `http://local.host:5000/`.
Point local.host in your host file to localhost or 127.0.0.1

Copy the App ID and Secret from the Facebook app settings page into your `.env`:

    echo FACEBOOK_APP_ID=12345 >> .env
    echo FACEBOOK_SECRET=abcde >> .env

Add the mongolab db addon after creating a heroku app and put the db uri into your .env

    echo MONGOLAB_URI=... >> .env


Launch the app with [Foreman](http://blog.daviddollar.org/2011/05/06/introducing-foreman.html):

    foreman start

Deploy to Heroku
-----------------------------------------

    heroku create --stack cedar
    git push heroku master
    heroku config:add FACEBOOK_APP_ID=12345 FACEBOOK_SECRET=abcde

