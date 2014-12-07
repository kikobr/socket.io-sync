// PUT THIS IN A SCRIPT TAG IN THE CLIENT, RIGHT BEFORE IO INITIALIZATION 

// Since I cannot find a way to emit events from server to server, 
// I'm using this client script to mirror events and send them back to server.
// model -> socket.emit('sync:toServer:event');

// Append here all namespaces used, or left only '/' for the default.
var namespaces = ['/', '/customRoom'];

namespaces.forEach(function(namespace){
	var socket = io.connect(namespace);
	socket.on('message', function(message, data){
		data = !data ? "" : data;
		try {
			var path = message.split(':');
			if(path[0] == 'sync'){
				// Sending back to server
				if(path[1] == 'toServer'){
					socket.emit(path[2], data);
				}
			}
		} catch(err){}
	});
});