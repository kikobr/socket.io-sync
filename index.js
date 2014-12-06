var app, io, session, cookie, cookieParser, sessionStore, MobileDetect, Socket;

// Config
var COOKIE_SECRET = 'secret-socket.io-sync',
	COOKIE_NAME = 'socket.io-sync-id';
	logging = false,
	clients = [];

// Exporting module
module.exports = function(obj){
	app = obj.app || null;
	io = obj.io || null;
	logging = obj.logging || logging;

	if(!app || !io){
		throw new Error('You must pass express and socket.io instance as arguments in the module function: mb = require("./socket.io-sync")({app:app, io:io})');
	}

	// Express cookie solution extracted from https://github.com/adelura/socket.io-express-solution
	session = require('express-session');
	cookie = require('cookie');
	cookieParser = require('cookie-parser');
	sessionStore = new session.MemoryStore();
	MobileDetect = require('mobile-detect');

	// Try getting Socket class
	try { Socket = obj.Socket ? require(obj.Socket) : require('socket.io/lib/socket'); } 
	catch(err){ throw new Error('Failed at getting socket.io/lib/socket. Try to pass its path (from your node_modules) as an instance: mb = require("./socket.io-sync")({app:app, io:io, Socket:"socket.io/lib/socket"})'); }

	// Setting middlewares
	app.use(cookieParser(COOKIE_SECRET));
	app.use(session({
		name: COOKIE_NAME,
		store: sessionStore,
		secret: COOKIE_SECRET,
		saveUninitialized: true,
		resave: true,
		cookie: {
			path: '/',
			httpOnly: true,
			secure: false,
			maxAge: null
		}
	}));

	// This will be run once, in the handshake
	io.use(handshakeConfiguration);

	// Connection Handler
	io.on('connection', function(socket){
	    clients.push(socket); // managing online

	    var _sid 			= socket.handshake.sid,
	    	_session 		= socket.handshake.session,
	    	syncPassword 	= _session.syncPassword,
	    	isMobile 		= _session.isMobile;

	    logging ? console.log(_session) : '';
		
		// Initializing
		if(isMobile){
			data = {
				isSynced: _session.syncedTo ? true : false,
			};
			// Events fire both on client and server, for convenience
			socket.emit('mobileInit', data);
			socket.send('sync:toServer:mobileInit', data);
			// Emit sync if available
			if(socket.isSynced()){
				socket.emit('mobileSynced');
				socket.send('sync:toServer:mobileSynced');				
			}
		} else {
			data = {
				isSynced: _session.syncedTo ? true : false,
				syncPassword: _session.syncPassword
			};
			// Events fire both on client and server, for convenience
			socket.emit('desktopInit', data);
			socket.send('sync:toServer:desktopInit', data);
			// Emit sync if available
			if(socket.isSynced()){
				socket.emit('desktopSynced');
				socket.send('sync:toServer:desktopSynced');				
			}
		}

		// Disconnection Handler
		socket.on('disconnect', function(){
			clients.splice(clients.indexOf(socket), 1); // managing online
		})
	});

	// PUBLIC
	this.randomPassword = randomPassword;
	this.clients = clients;

	// Applying functions to socket, so that you can use socket.fn();
	Socket.prototype.sync = sync;
	Socket.prototype.isSynced = isSynced;
	Socket.prototype.getSynced = getSynced;
	Socket.prototype.emitToSynced = emitToSynced;

	// Done
	logging ? console.log('Module socket.io-sync loaded') : '';
	return this;
}


// =====================================================================
// Configuration Functions
// =====================================================================
function handshakeConfiguration(socket, next){
	try {
		
		var data = socket.handshake || socket.request;

		if (! data.headers.cookie) { return next(new Error('Missing cookie headers')); }

		// Getting Cookies
		var cookies = cookie.parse(data.headers.cookie);
		
		// If there's no custom cookie
		if (! cookies[COOKIE_NAME]) { return next(new Error('Missing cookie ' + COOKIE_NAME)); }

		// Getting custom cookie
		var sid = cookieParser.signedCookie(cookies[COOKIE_NAME], COOKIE_SECRET);
		if (! sid) { return next(new Error('Cookie signature is not valid')); }

		// Can be get by socket.handshake.sid
		data.sid = sid;

		// Creating the value on store
		sessionStore.get(sid, function(err, session) {
			if (err) return next(err);
			if (!session) return next(new Error('session not found'));
			
			// Check if it's mobile
			session.isMobile = new MobileDetect(data.headers['user-agent']).mobile() != null ? true : false;

			// Generate a sync password if none
			if(!session.syncPassword){
				session.syncPassword = randomPassword(4);
				session.syncedTo = false;
			}
			
			// Applying session
			data.session = session;
			sessionStore.set(sid, session);
			next();
		});

	} catch (err) {
		console.error(err.stack);
		next(new Error('Internal server error'));
	}
}

// Syncing mobile to desktop
function sync(password){

	// socket is probably mobile
    var socket  		= this,
    	_sid 			= socket.handshake.sid,
    	_session 		= socket.handshake.session,
    	syncPassword 	= _session.syncPassword,
    	isMobile 		= _session.isMobile;

	try {
		var regexp = new RegExp("^"+password+"$","i");
		// Check if matches any socket
		var matchesSomeone = false;
		clients.forEach(function(_socket){
			// Check only non-synced and desktops
			if(!_socket.handshake.session.syncedTo && !_socket.handshake.session.isMobile){
				// Check if this non-synced matches 
				if(_socket.handshake.session.syncPassword.match(regexp)){
					// Sync'em
					var _socket_sid = _socket.handshake.sid; // desktop
					// sync desktop to mobile socket
					sessionStore.get(_socket_sid, function(err, session) {
						session.syncedTo = _sid;
						sessionStore.set(_socket_sid, session);
						_socket.handshake.session = session; // update actual socket before refresh
						// emit events on both client and server, for convenience
						_socket.emit('desktopSynced');
						_socket.send('sync:toServer:desktopSynced');
				    });
					// sync mobile to desktop socket
					sessionStore.get(_sid, function(err, session) {
						session.syncedTo = _socket_sid;
						sessionStore.set(_sid, session);
						socket.handshake.session = session; // update actual socket before refresh
						// emit events on both client and server, for convenience
						socket.emit('mobileSynced');
						socket.send('sync:toServer:mobileSynced');
				    });
					matchesSomeone = true;
					return false; // break loop
				}
			}
		});
		if(!matchesSomeone){
			// emit events on both client and server, for convenience
			socket.emit('mobileSyncFailed');
			socket.send('sync:toServer:mobileSyncFailed');
			console.log('it doesnt match any sockets');
			return false; 
		} else {
			return true;
		}
	} catch(err){ console.log(err); }
}

// Return whether its synced or not
function isSynced(){
	var socket = this;
	return getSynced.call(this);
}

// Return a synced device
function getSynced(fn){
	var socket = this,
		isMobile = socket.handshake.session.isMobile,
		found = false;
	clients.forEach(function(_socket){
		// Search complementary device
		if(isMobile != _socket.handshake.session.isMobile){
			if(_socket.handshake.sid == socket.handshake.session.syncedTo){
				found = _socket;
				return false; // break loop
			}
		}
	});
	// Returning
	if(found){ 
		if(fn && typeof fn == "function"){
			return fn(found); 
		} else { return true; }
	}
	else { 
		logging ? console.error('No sockets synced to this one.') : ''; 
		return found; 
	}
}


// Emit event on synced
function emitToSynced(eventStr, data){
	var socket = this;
	getSynced.call(this, function(_socket){
		_socket.emit(eventStr, data);
	});
}


// =====================================================================
// TOOLKIT
// =====================================================================
// Generate simple random password
function randomPassword(length) {
  chars = "abcdefghijklmnopqrstuvwxyz1234567890";
  pass = "";
  for(x=0;x<length;x++) {
    i = Math.floor(Math.random() * chars.length);
    pass += chars.charAt(i);
  }
  return pass;
}
