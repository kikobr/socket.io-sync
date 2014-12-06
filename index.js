var app, io, session, cookie, cookieParser, sessionStore, MobileDetect, Socket, SocketExtended, SetupHandshakes, toolkit;

// Config
var logging = false,
	clients = [];

// Exporting module
module.exports = function(obj){
	app = obj.app || null;
	io = obj.io || null;
	logging = obj.logging || logging;

	if(!app || !io){
		throw new Error('You must pass express and socket.io instance as arguments in the module function: mb = require("./socket.io-sync")({app:app, io:io})');
	}
	
	// Setting up handshakes
	Setup = require('./lib/setup')({
		app: app,
		io: io,
		logging: logging
	});

	// Extending Socket class
	SocketExtended = require('./lib/socketExtended')({ 
		sessionStore: Setup.sessionStore,
		logging: logging,
		Socket: obj.Socket || false,
	});

	// Toolkit
	toolkit = require('./lib/toolkit');

	// PUBLIC
	this.randomPassword = toolkit.randomPassword;
	this.clients = Setup.clients;

	// Done
	logging ? console.log('Module socket.io-sync loaded') : '';
	return this;
}
