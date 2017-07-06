'use strict'

var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);
var path = require("path");
var connections = [];

// The default namespace is by default '/', but this variable is to use with numClientsInRoom
var defaultNamespace = '/';

server.listen(process.env.PORT || 8000);
console.log('Server running at port ' + '8000' || "" + process.env.PORT);

app.get('/', function(req, res) {
  res.sendFile(__dirname + '/index.html')
});

app.use('/js', express.static(path.join(__dirname, '/js')));
app.use('/styles', express.static(path.join(__dirname, '/styles')));


io.sockets.on('connection', function(socket) {
  connections.push(socket);
  console.log('Connected: %s sockets connected', connections.length);

  // Convenience function to log server messages on the client (client listens to it on socket.on('log'))
  function log() {
    var array = ['Message from server: '];
    array.push.apply(array, arguments);
    socket.emit('log', array);
  }

  socket.on('message', function(message) {
    log('Client said: ', message);
    // for a real app, would be room-only (not broadcast)
    socket.broadcast.emit('message', message);
  });

  socket.on('disconnect', function(data) {
    connections.splice(connections.indexOf(socket), 1);
    console.log('Disconnected: %s sockets connected', connections.length);
  });

  socket.on('create or join', function(room) {
    // Total number of clients in the socket
    var numClients = io.engine.clientsCount;
    log('Received request to create or join room ' + room);

    if(numClients === 1) {
      socket.join(room);
      log('Client ID ' + socket.id + ' created room ' + room);
      socket.emit('created', room, socket.id);

    } else if(numClients === 2) {
      log('Client ID ' + socket.id + ' joined room ' + room);
      socket.join(room);
      socket.emit('joined', room, socket.id);
      io.sockets.in(room).emit('ready');

    } else {
      // Max two clients for now
      socket.emit('full', room);
    }

  });
});

/* Function to find out how many clients there are in a room
   Used to minimize each room to contain x clients */
// function numClientsInRoom(namespace, room) {
//   console.log(room);
//   console.log(io.nsps[namespace].adapter.rooms[room].length);
//   var clients = io.nsps[namespace].adapter.rooms[room];
//   return clients.length;
// }
