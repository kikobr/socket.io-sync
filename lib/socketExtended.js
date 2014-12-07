var sessionStore, logging;

module.exports = function(obj){
	sessionStore 	= obj.sessionStore;
	logging 	 	= obj.logging;

	// Try getting Socket class from app directory
	try { Socket = obj.Socket ? require(obj.Socket) : require(require('path').dirname(process.mainModule.filename)+'/node_modules/socket.io/lib/socket'); } 
	catch(err){ throw new Error('Failed at getting socket.io/lib/socket. Try to pass its path as an instance: mb = require(__dirname+"/node_modules/socket.io-sync")({app:app, io:io, Socket:"socket.io/lib/socket"})'); }

	// Applying functions to Socket class, so that you can use socket.fn();
	Socket.prototype.sync = exports.sync;
	Socket.prototype.isSynced = exports.isSynced;
	Socket.prototype.getSynced = exports.getSynced;
	Socket.prototype.emitToSynced = exports.emitToSynced;
	Socket.prototype.recheckSync = exports.recheckSync;
	Socket.prototype.killSync = exports.killSync;

	// Export functions
	return exports;
};

// Syncing mobile to desktop
exports.sync = function (password){

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
			// Check only non-synced and complementary devices
			if(!_socket.handshake.session.syncedTo && _socket.handshake.session.isMobile != isMobile){
				// Check if this non-synced matches 
				if(_socket.handshake.session.syncPassword.match(regexp)){

					// Sync'em
					var _socket_sid = _socket.handshake.sid; // desktop

					// sync found socket
					sessionStore.get(_socket_sid, function(err, session) {
						session.syncedTo = _sid;
						sessionStore.set(_socket_sid, session);
						_socket.handshake.session = session; // update actual socket before refresh

						data = {
							sid: _socket_sid,
							isSynced: session.syncedTo ? true : false,
							syncedTo: session.syncedTo,
							syncPassword: session.syncPassword,
							isMobile: session.isMobile
						};

						// emit events on both client and server, for convenience
						if(isMobile){
							_socket.emit('mobileSynced', data);
							_socket.send('sync:toServer:mobileSynced', data);
						} else {
							_socket.emit('desktopSynced', data);
							_socket.send('sync:toServer:desktopSynced', data);				
						}
				    });

					// sync origin socket
					sessionStore.get(_sid, function(err, session) {
						session.syncedTo = _socket_sid;
						sessionStore.set(_sid, session);
						socket.handshake.session = session; // update actual socket before refresh

						data = {
							sid: _sid,
							isSynced: session.syncedTo ? true : false,
							syncedTo: session.syncedTo,
							syncPassword: session.syncPassword,
							isMobile: session.isMobile
						};

						// emit events on both client and server, for convenience
						if(isMobile){
							socket.emit('mobileSynced');
							socket.send('sync:toServer:mobileSynced');
						} else {
							socket.emit('desktopSynced');
							socket.send('sync:toServer:desktopSynced');				
						}
				    });
					matchesSomeone = true;
					return false; // break loop
				}
			}
		});
		if(!matchesSomeone){
			data = {
				sid: _sid,
				isSynced: _session.syncedTo ? true : false,
				syncedTo: _session.syncedTo,
				syncPassword: syncPassword,
				isMobile: isMobile
			};
			// emit events on both client and server, for convenience
			if(isMobile){
				socket.emit('mobileSyncFailed', data);
				socket.send('sync:toServer:mobileSyncFailed', data);
			} else {
				socket.emit('desktopSyncFailed', data);
				socket.send('sync:toServer:desktopSyncFailed', data);				
			}
			console.log('it doesnt match any sockets');
			return false; 
		} else {
			return true;
		}
	} catch(err){ console.log(err); }
};

// Return whether its synced or not
exports.isSynced = function(){
	var socket = this;
	return exports.getSynced.call(this);
};

// Return a synced device
exports.getSynced = function(fn){
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
};


// Emit event on synced
exports.emitToSynced = function(eventStr, data){
	var socket = this;
	socket.getSynced(function(_socket){
		_socket.emit(eventStr, data);
	});
};

// Reset losen syncs
exports.recheckSync = function(){
	var socket 	= this,
		sid 	= socket.handshake.sid;
	var syncedSocket = socket.getSynced(function(_socket){
		return _socket;
	});
	if(syncedSocket == false){
		// Restore
		sessionStore.get(sid, function(err, session) {
			session.syncedTo = false;
			sessionStore.set(sid, session);
			socket.handshake.session = session;
	    });
	};
};

// Kill Sync
exports.killSync = function(){
	var socket 	= this,
		sid 	= socket.handshake.sid;
    // Delete this socket syncedTo
	sessionStore.get(sid, function(err, session) {
		session.syncedTo = false;
		sessionStore.set(sid, session);
		socket.handshake.session = session;
    });
	// Delete syncedSocket syncedTo
	var syncedSocket = socket.getSynced(function(_socket){
		var _sid = _socket.handshake.sid;
		sessionStore.get(_sid, function(err, session) {
			session.syncedTo = false;
			sessionStore.set(_sid, session);
			_socket.handshake.session = session;
	    });
	});
	if(!syncedSocket){ logging ? console.log('There is no synced socket to kill') : ''; }
}