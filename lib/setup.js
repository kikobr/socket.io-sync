var app, io, session, cookie, cookieParser, sessionStore, MobileDetect, Socket, exports;

var COOKIE_SECRET = 'secret-socket.io-sync',
	COOKIE_NAME = 'socket.io-sync-id',
	clients = [];

module.exports = function(obj){
	app 	= obj.app;
	io 		= obj.io; // array or single io instance
	logging = obj.logging;

	// Express cookie solution extracted from https://github.com/adelura/socket.io-express-solution
	session 		= require('express-session');
	cookie 			= require('cookie');
	cookieParser 	= require('cookie-parser');
	sessionStore 	= new session.MemoryStore();
	MobileDetect 	= require('mobile-detect');
	toolkit 		= require('./toolkit');

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

	// Loop through IO's instances if its an array, otherwise just run it for a single instance
	for(i=0; i < (Array.isArray(io) ? io.length : 1); i++ ){

		var _io = Array.isArray(io) ? io[i] : io;

		// This will be run once, in the handshake
		_io.use(handshakeConfiguration);

		// Connection Handler
		_io.on('connection', function(socket){
		    clients.push(socket); // managing online

		    var _sid 			= socket.handshake.sid,
		    	_session 		= socket.handshake.session,
		    	syncPassword 	= _session.syncPassword,
		    	isMobile 		= _session.isMobile;

		    logging ? console.log(_session) : '';
			
			// Initializing
			data = {
				sid: _sid,
				isSynced: _session.syncedTo ? true : false,
				syncedTo: _session.syncedTo,
				syncPassword: _session.syncPassword,
				isMobile: isMobile
			};
			if(isMobile){
				// Events fire both on client and server, for convenience
				socket.emit('mobileInit', data);
				socket.send('sync:toServer:mobileInit', data);
				// Emit sync if available
				if(socket.isSynced()){
					socket.emit('mobileSynced', data);
					socket.send('sync:toServer:mobileSynced', data);				
				}
			} else {
				// Events fire both on client and server, for convenience
				socket.emit('desktopInit', data);
				socket.send('sync:toServer:desktopInit', data);
				// Emit sync if available
				if(socket.isSynced()){
					socket.emit('desktopSynced', data);
					socket.send('sync:toServer:desktopSynced', data);				
				}
			}

			// Check if this socket is still synced to someone
			socket.recheckSync();

			// Bind checking sync to event
			socket.on('recheckSync', function(){
				socket.recheckSync();
			});

			// Disconnection Handler
			socket.on('disconnect', function(){
				clients.splice(clients.indexOf(socket), 1); // managing online
			});
		});
	}

	return {
		sessionStore: sessionStore,
		COOKIE_SECRET: COOKIE_SECRET,
		COOKIE_NAME: COOKIE_NAME,
		clients: clients
	};
}

// =====================================================================
// Configuration
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
				session.syncPassword = toolkit.randomPassword(4);
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