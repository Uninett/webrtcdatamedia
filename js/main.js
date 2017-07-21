'use strict';

// var configuration = {
//   'iceServers': [{
//     'urls': 'stun:stun.l.google.com:19302'
//   }]
// };
var configuration = null;
var localStream;

// HTML elements //
var localAudio = document.querySelector('#localAudio');
var remoteAudio = document.querySelector('#remoteAudio');
var liveBtn = document.querySelector('#liveBtn');
var stopLiveBtn = document.querySelector('#stopLiveBtn');
var recordBtn = document.getElementById('recordBtn');
var stopBtn = document.getElementById('stopBtn');
var localClips = document.querySelector('.local-clips');
var remoteClips = document.querySelector('.remote-clips');
var notifications = document.querySelector('#notifications');
var liveAudio = document.querySelector('#liveAudio');
var dataChannelNotification = document.createElement('p');

// Event handlers on the buttons
// sendBtn.addEventListener('click', sendData);

// Peerconnection and data channel variables
var liveDataChannel;
var clipDataChannel;

var bufferSize = document.getElementById('bufferSizeSelector').value;
console.log(bufferSize);
var txrxBufferSize = bufferSize*10;
var peerCon;
var output1 = new Float32Array(txrxBufferSize);
var output2 = new Float32Array(txrxBufferSize);
var outputFront = txrxBufferSize;
var outputEnd = 0;

// Audio context variables
var audioContext;
var audioContextSource;
var scriptNode;

// isInitiator is the one who's creating the room
var isInitiator;

var room = window.location.hash.substring(1);
if (!room) {
  room = window.location.hash = prompt('Enter a room name:');;
}

/*******************************************************************************
* Signaling Server
*******************************************************************************/
//Connect to the signaling server
var socket = io.connect();

// Listens to the servers console logs
socket.on('log', function(array) {
  console.log.apply(console, array);
});

// The client tries to create or join a room, only if the room is not blank
if (room !== '') {
  socket.emit('create or join', room);
  console.log('Attempted to create or  join room', room);
}

socket.on('credentials', function(credentials) {
  configuration = credentials;
  console.log(configuration);
  console.log('helo');
})

socket.on('created', function(room, clientId) {
  console.log('Created room ' + room);
  isInitiator = true;
  getAudio();
});

socket.on('joined', function(room, clientId) {
  console.log('joined ' + room);
  isInitiator = false;
  createPeerConnection(isInitiator, configuration);
  getAudio();
});

socket.on('full', function(room, clientId) {
  var newRoom = window.location.hash = prompt('Room ' + room + ' is full. Enter a new room name:');
  socket.emit('create or join', newRoom);
  console.log('Attempting to create a new room because room ' + room + ' is full.');
});

socket.on('ready', function() {
  console.log('Socket is ready');
  createPeerConnection(isInitiator, configuration);
});

socket.on('message', function(message) {
  console.log('Client received message:', message);
  signalingMessageCallback(message);
});

/**
* Send message to signaling server
*/
function sendMessage(message) {
  console.log('Client sending message: ', message);
  socket.emit('message', message, room);
}

/****************************************************************************
* User media (audio)
****************************************************************************/

function getAudio(){
  console.log('Getting user media (audio) ...');
  navigator.mediaDevices.getUserMedia({
    audio: true,
  })
  .then(gotStream)
  .catch(function(e) {
    alert('getUserMedia() error: ' + e.name);
  });
}

function gotStream(stream) {
  console.log('Received local stream');
  localStream = stream;
  var audioTracks = localStream.getAudioTracks();
  if(audioTracks.length > 0) {
    console.log('Using Audio device: ' + audioTracks[0].label);
  }

  // Live audio starts
  liveBtn.disabled = false;
  audioContext = new AudioContext();
  audioContextSource = audioContext.createMediaStreamSource(localStream);
  scriptNode = audioContext.createScriptProcessor(bufferSize, 2, 2);

  // Listens to the audiodata
  scriptNode.onaudioprocess = function(e) {
    console.log(scriptNode.bufferSize);
    /*
    // Using audioBufferSourceNode to start Audio
    */
    // var audioBuffer = audioContext.createBuffer(2, bufferSize, audioContext.sampleRate);
    // var audioBufferSourceNode = audioContext.createBufferSource();
    // audioBufferSourceNode.connect(audioContext.destination);
    // audioBuffer.copyToChannel(e.inputBuffer.getChannelData(0), 0 , 0);
    // audioBuffer.copyToChannel(e.inputBuffer.getChannelData(1), 1 , 0);
    // audioBufferSourceNode.buffer = audioBuffer;
    // audioBufferSourceNode.start();

    /*
    // Using ScriptNodeProcessor to start audio
    */
    var input = e.inputBuffer.getChannelData(0);
    liveDataChannel.send(input);

    if(outputFront == outputEnd){
      // console.log(outputEnd);
    }
    else {
      var outputBuffer1 = e.outputBuffer.getChannelData(0);
      var outputBuffer2 = e.outputBuffer.getChannelData(1);
      for (var sample = 0; sample < bufferSize; sample++) {
        // make output equal to the same as the input
        outputBuffer1[sample] = output1[outputEnd]
        outputBuffer2[sample] = output2[outputEnd];
        outputEnd = (outputEnd+1)%(txrxBufferSize);
      }
    }
  }

  liveBtn.onclick = function() {
    liveBtn.disabled = true;
    stopLiveBtn.disabled = false;
    document.getElementById('bufferSizeSelector').disabled = true;
    audioContextSource.connect(scriptNode);
    scriptNode.connect(audioContext.destination);
  }

  stopLiveBtn.onclick = function() {
    audioContextSource.disconnect(scriptNode);
    scriptNode.disconnect(audioContext.destination);
    liveBtn.disabled = false;
    stopLiveBtn.disabled = true;
    document.getElementById('bufferSizeSelector').disabled = false;
  }
  // Live audio ends

  // MediaRecorder starts
  var mediaRecorder = new MediaRecorder(localStream,  {mimeType : 'audio/webm; codecs=opus'});
  var chunks = [];
  recordBtn.disabled = false;

  recordBtn.onclick = function() {
    recordBtn.disabled = true;
    stopBtn.disabled = false;

    mediaRecorder.start();
    console.log(mediaRecorder.state);
  }

  stopBtn.onclick = function() {
    recordBtn.disabled = false;
    stopBtn.disabled = true;
    mediaRecorder.stop();
  }

  mediaRecorder.onstop = function(e) {
    console.log("data available after MediaRecorder.stop() called.");
    var blob = new Blob(chunks, { 'type' : 'audio/ogg; codecs=opus' });
    saveAudioClip(blob);
    chunks = [];
  }

  mediaRecorder.ondataavailable = function(e) {
    chunks.push(e.data);
    console.log(e.data);
  }
  // MediaRecorder ends
}

/****************************************************************************
* WebRTC peer connection and data channel
****************************************************************************/

function signalingMessageCallback(message) {
  if (message.type === 'offer') {
    console.log('Got offer. Sending answer to peer.');
    peerCon.setRemoteDescription(new RTCSessionDescription(message), function(){}, logError);
    peerCon.createAnswer(onLocalSessionCreated, logError);

  } else if (message.type === 'answer') {
    console.log('Got answer');
    peerCon.setRemoteDescription(new RTCSessionDescription(message), function (){}, logError);

  } else if (message.type === 'candidate') {
    peerCon.addIceCandidate(new RTCIceCandidate({
      candidate: message.candidate
    }));

  } else if (message === 'bye') {
    // BAI
    liveDataChannel.close();
    clipDataChannel.close();
    dataChannelNotification.textContent = 'Data channel connection closed!';
    dataChannelNotification.style.color = 'red';
    isInitiator = true;
  }
}

function createPeerConnection(isInitiator, config) {
  console.log('Creating peer connection as initiator?', isInitiator, 'config', config);
  peerCon = new RTCPeerConnection(config);

  // Send any ice candidates to the other peer
  peerCon.onicecandidate = function(event) {
    console.log('icecandidate event: ', event);
    if(event.candidate) {
      sendMessage({
        type: 'candidate',
        label: event.candidate.sdpMLineIndex,
        id: event.candidate.sdpMid,
        candidate: event.candidate.candidate
      });

    } else {
      console.log('End of candidate');
    }
  };

  if(isInitiator) {
    console.log('Creating Data Channel');
    liveDataChannel = peerCon.createDataChannel('live');
    clipDataChannel = peerCon.createDataChannel('clip');
    onDataChannelCreated(liveDataChannel);
    onDataChannelCreated(clipDataChannel);

    console.log('Creating an offer');
    peerCon.createOffer(onLocalSessionCreated, logError);

  } else {
    peerCon.ondatachannel = function(event) {
      console.log('ondatachannel:', event.channel);
      if(event.channel.label == 'live'){
        liveDataChannel = event.channel;
        onDataChannelCreated(liveDataChannel);
      } else {
        clipDataChannel = event.channel;
        onDataChannelCreated(clipDataChannel);
      }
    };
  }
}

function onLocalSessionCreated(desc) {
  console.log('local session created: ', desc);
  peerCon.setLocalDescription(desc, function() {
    console.log('sending local desc: ', peerCon.localDescription);
    sendMessage(peerCon.localDescription);
  }, logError);
}

function onDataChannelCreated(channel) {
  console.log('onDataChannelCreated: ', channel);

  channel.onopen = function() {
    console.log('CHANNEL opened!');
    dataChannelNotification.textContent = 'Data channel connection established!';
    dataChannelNotification.style.color = 'green';
    notifications.appendChild(dataChannelNotification);
  };

  // onmessage stores an EventHandler for whenever something is fired on the dataChannel
  if(channel.label == 'live') {
    channel.onmessage = receiveLiveData();
  } else {
    channel.onmessage = receiveClipData();
  }

  channel.onclose = function() {
    console.log('Closed');
  }
}

/*
// Sends live audio stream throigh data channel
*/
function receiveLiveData() {
  return function onmessage(event) {
    var remoteAudioBuffer = new Float32Array(event.data);
    for (var sample = 0; sample < bufferSize; sample++) {
      // make output equal to the same as the input
      output1[outputFront] = remoteAudioBuffer[sample];
      output2[outputFront] = remoteAudioBuffer[sample];
      outputFront = (outputFront+1)%(txrxBufferSize);
    }
  }
}

/*
// Sends audio clip
*/
function receiveClipData() {
  return function onmessage(event){
    var data = new Uint8ClampedArray(event.data);
    var blob = new Blob([data], { 'type' : 'audio/ogg; codecs=opus' });
    receiveAudio(blob);
  }
}

/****************************************************************************
* UI-related functions and ETC
****************************************************************************/

// dataChannel.send(data), data gets received by using event.data
// Sending a blob through RTCPeerConnection is not supported. Must use an ArrayBuffer?
function sendData(blob) {
  var fileReader = new FileReader();
  var arrayBuffer;

  fileReader.onloadend = () => {
    arrayBuffer = fileReader.result;
    console.log(arrayBuffer);
    clipDataChannel.send(arrayBuffer);
  }

  fileReader.readAsArrayBuffer(blob);
}

function saveAudioClip(audioblob) {
  var clipName = prompt('Enter a name for your sound clip?','My unnamed clip');
  console.log(clipName);
  var clipContainer = document.createElement('article');
  var clipLabel = document.createElement('p');
  var audio = document.createElement('audio');
  var deleteButton = document.createElement('button');
  var sendButton = document.createElement('button');

  clipContainer.classList.add('clip');
  audio.setAttribute('controls', '');
  deleteButton.textContent = 'Delete';
  deleteButton.className = 'deleteBtn';
  sendButton.textContent = 'Send';
  sendButton.className = 'sendBtn'

  if(clipName === null) {
    clipLabel.textContent = 'My unnamed clip';
  } else {
    clipLabel.textContent = clipName;
  }

  clipContainer.appendChild(audio);
  clipContainer.appendChild(clipLabel);
  clipContainer.appendChild(deleteButton);
  clipContainer.appendChild(sendButton);
  localClips.appendChild(clipContainer);

  audio.controls = true;
  var audioURL = window.URL.createObjectURL(audioblob);
  audio.src = audioURL;

  deleteButton.onclick = function(e) {
    var evtTgt = e.target;
    evtTgt.parentNode.parentNode.removeChild(evtTgt.parentNode);
  }

  sendButton.onclick = function(e) {
    sendData(audioblob);
  }
}

function receiveAudio(audioblob) {
  var clipContainer = document.createElement('article');
  var clipLabel = document.createElement('p');
  var audio = document.createElement('audio');
  var deleteButton = document.createElement('button');
  var clipName = remoteClips.children.length;

  clipContainer.classList.add('clip');
  audio.setAttribute('controls', '');
  deleteButton.textContent = 'Delete';
  deleteButton.className = 'deleteBtn';

  clipLabel.textContent = "Clip: " + clipName;

  clipContainer.appendChild(audio);
  clipContainer.appendChild(clipLabel);
  clipContainer.appendChild(deleteButton);
  remoteClips.appendChild(clipContainer);

  audio.controls = true;
  var audioURL = window.URL.createObjectURL(audioblob);
  audio.src = audioURL;

  deleteButton.onclick = function(e) {
    var evtTgt = e.target;
    evtTgt.parentNode.parentNode.removeChild(evtTgt.parentNode);
  }
}

// Gives a random token to generate a random room name
// function randomToken() {
//   return Math.floor((1 + Math.random()) * 1e16).toString(16).substring(1);
// }

//Runs the code when the Peer exits the page
window.onbeforeunload = function() {
  sendMessage('bye');
  liveDataChannel.close();
  clipDataChannel.close();
}

function logError(err) {
  console.log(err.toString(), err);
}

function changeBuffer(){
  scriptNode = audioContext.createScriptProcessor(bufferSize, 2, 2);
  bufferSize = document.getElementById('bufferSizeSelector').value;
  txrxBufferSize = bufferSize*10;
  console.log(bufferSize);
}
