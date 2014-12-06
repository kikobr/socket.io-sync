var sessionStore, logging;

module.exports = function(obj){
	sessionStore 	= obj.sessionStore;
	logging 	 	= obj.logging;

	// Try getting Socket class from app directory
	try { Socket = obj.Socket ? require(obj.Socket) : require(require('path').dirname(process.mainModule.filename)+'/node_modules/socket.io/lib/socket'); } 
	catch(err){ throw new Error('Failed at getting socket.io/lib/socket. Try to pass its path as an instance: mb = require(__dirname+"/node_modules/socket.io-sync")({app:app, io:io, Socket:"socket.io/lib/socket"})'); }

	// Applying functions to socket, so that you can use socket.fn();
	Socket.prototype.sync = exports.sync;
	Socket.prototype.isSynced = exports.isSynced;
	Socket.prototype.getSynced = exports.getSynced;
	Socket.prototype.emitToSynced = exports.emitToSynced;

	// Export functions
	return exports;
}

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
exports.isSynced = function(){
	var socket = this;
	return exports.getSynced.call(this);
}

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
}


// Emit event on synced
exports.emitToSynced = function(eventStr, data){
	var socket = this;
	exports.getSynced.call(this, function(_socket){
		_socket.emit(eventStr, data);
	});
}