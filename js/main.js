'use strict';

//
// Audio worker node forwarding audio data uncompressed onto a data channel
//
class AudioSampleQueue {
    // Queue class for 32bit float audio samples
    constructor(maxqueuelength = 1024) {
    this.maxQueueLength = maxqueuelength;
    this.queue = new Float32Array(this.maxQueueLength);
    this.front = 0;
    this.end = 0;
    this.empty = true;
    }

    enqueue(sample) {
    // Insert sample at end of queue
    if (this.length() == this.maxQueueLength) {
        // console.log("Queue is full.")
    } else {
        this.queue[this.end] = sample;
        this.end = (this.end + 1) % this.maxQueueLength;
        this.empty = false;
    }
    }

    dequeue() {
    // Remove and return sample from front of queue
    if (this.length() > 0) {
        var sample = this.queue[this.front];
        this.front = (this.front + 1) % this.maxQueueLength;
        this.empty = (this.front == this.end);
        return sample;
    }
    // console.log("Queue is empty (" + this.front + ")");
    return null;
    }

    length() {
    // Return length of queue
        if (this.empty) {
        return 0;
    }
    var l = (this.end - this.front + this.maxQueueLength) % this.maxQueueLength;
    return l == 0 ? this.maxQueueLength : l;
    }
}


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
var localVideo = document.querySelector('#localVideo');
var videoBtn = document.querySelector('#videoBtn');
var liveBtn = document.querySelector('#liveBtn');
var stopLiveBtn = document.querySelector('#stopLiveBtn');
var recordBtn = document.getElementById('recordBtn');
var stopBtn = document.getElementById('stopBtn');
var localClips = document.querySelector('.local-clips');
var remoteClips = document.querySelector('.remote-clips');
var notifications = document.querySelector('#notifications');
var bitRate = document.querySelector('#bitRate');
var bytesSentTxt = document.querySelector('#bytesSent');
var bytesReceivedTxt = document.querySelector('#bytesReceived');
var liveAudio = document.querySelector('#liveAudio');
var dataChannelNotification = document.createElement('p');
var liveAudioNotification = document.createElement('p');

// Photo context variables for video grab data
// remoteCanvas is a canvas with continously an updated photo-context to make a video
var remoteCanvas = document.getElementById('remoteCanvas');
var localCanvas = document.getElementById('localCanvas');
var remoteContext = remoteCanvas.getContext('2d');
var localContext = localCanvas.getContext('2d');
var photoContextW;
var photoContextH;
var bytesReceived = 0;
var bytesSent = 0;

// Peerconnection and data channel variables
var liveDataChannel;
var clipDataChannel;
var videoDataChannel;

var bufferSize = document.getElementById('bufferSizeSelector').value;
console.log(bufferSize);
var txrxBufferSize = bufferSize*10;
var peerCon;
var output1 = new AudioSampleQueue(txrxBufferSize);
var output2 = new AudioSampleQueue(txrxBufferSize);

// Audio context variables
var audioContext;
var audioContextSource;
var scriptNode;

// isInitiator is the one who's creating the room
var isInitiator;

var room = window.location.hash.substring(1);
if (!room) {
  room = window.location.hash = prompt('Enter a room name:');
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
  // configuration = credentials;
})

socket.on('created', function(room, clientId) {
  console.log('Created room ' + room);
  isInitiator = true;
  getMedia();
});

socket.on('joined', function(room, clientId) {
  console.log('joined ' + room);
  isInitiator = false;
  createPeerConnection(isInitiator, configuration);
  getMedia();
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

function getMedia(){
  console.log('Getting user media (audio) ...');
  navigator.mediaDevices.getUserMedia({
    audio: true,
    video: {width: 640, height: 480, frameRate: { ideal: 60, max: 60 }}
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
  var videoTracks = localStream.getVideoTracks();
  if(audioTracks.length > 0) {
    console.log('Using Audio device: ' + audioTracks[0].label);
    console.log('Using Video device: ' + videoTracks[0].label);
  }

  // Live video starts
  var streamURL = window.URL.createObjectURL(stream);
  localVideo.src = streamURL;

  localVideo.onloadedmetadata = function() {
    localCanvas.width = photoContextW = localVideo.videoWidth;
    localCanvas.height = photoContextH = localVideo.videoHeight;
    remoteCanvas.width = photoContextW*2;
    remoteCanvas.height = photoContextH*2;
    console.log('gotStream with with and height:', photoContextW, photoContextH);
    console.log('');
    // window.setTimeout(renderPhoto2, 1000);
    // window.setTimeout(renderPhoto2, 5000);
  };
  videoBtn.onclick = function() {
    // Using photo-data from the video stream to create a matching photocontext
    draw();
  }
  // Live video code ends

  // Live audio starts
  printBitRate();
  liveBtn.disabled = false;

  liveBtn.onclick = function() {
    liveBtn.disabled = true;
    stopLiveBtn.disabled = false;
    document.getElementById('bufferSizeSelector').disabled = true;
    startBuffer();
    audioContextSource.connect(scriptNode);
    scriptNode.connect(audioContext.destination);
    sendMessage('startLive');
  }

  stopLiveBtn.onclick = function() {
    audioContextSource.disconnect(scriptNode);
    scriptNode.disconnect(audioContext.destination);
    liveBtn.disabled = false;
    stopLiveBtn.disabled = true;
    sendMessage('stopLive');
    audioContext.close();
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
    videoDataChannel.close();
    dataChannelNotification.textContent = 'Data channel connection closed!';
    dataChannelNotification.style.color = 'red';
    isInitiator = true;

  } else if (message === 'startLive') {
    liveAudioNotification.textContent = 'The other peer started to stream live audio';
    liveAudioNotification.style.color = 'green';
    notifications.appendChild(liveAudioNotification);

  } else if (message === 'stopLive') {
    liveAudioNotification.textContent = 'The other peer has stopped streaming live audio';
    liveAudioNotification.style.color = 'red';

    if (audioContext.state === 'running') {
      audioContextSource.disconnect(scriptNode);
      scriptNode.disconnect(audioContext.destination);
      liveBtn.disabled = false;
      stopLiveBtn.disabled = true;
      sendMessage('stopLive');
      audioContext.close();
      document.getElementById('bufferSizeSelector').disabled = false;
    }
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
    liveDataChannel = peerCon.createDataChannel('live', {maxRetransmits: 0, ordered: false});
    clipDataChannel = peerCon.createDataChannel('clip');
    videoDataChannel = peerCon.createDataChannel('video', {maxRetransmits: 0, ordered: true});
    onDataChannelCreated(liveDataChannel);
    onDataChannelCreated(clipDataChannel);
    onDataChannelCreated(videoDataChannel);

    console.log('Creating an offer');
    peerCon.createOffer(onLocalSessionCreated, logError);

  } else {
    peerCon.ondatachannel = function(event) {
      console.log('ondatachannel:', event.channel);
      if(event.channel.label == 'live'){
        liveDataChannel = event.channel;
        onDataChannelCreated(liveDataChannel);
      } else if(event.channel.label == 'clip'){
        clipDataChannel = event.channel;
        onDataChannelCreated(clipDataChannel);
      } else {
        videoDataChannel = event.channel;
        onDataChannelCreated(videoDataChannel);
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
    videoBtn.disabled = false;
    notifications.appendChild(dataChannelNotification);
  };

  // onmessage stores an EventHandler for whenever something is fired on the dataChannel
  if(channel.label == 'live') {
    channel.onmessage = receiveLiveData();
  } else if(channel.label == 'clip'){
    channel.onmessage = receiveClipData();
  } else {
    channel.onmessage = receiveVideoData();
  }

  channel.onclose = function() {
    console.log('Closed');
  }
}

/*
// Receives live audio stream throigh data channel
*/
function receiveLiveData() {
  return function onmessage(event) {
    var remoteAudioBuffer = new Float32Array(event.data);
    for (var sample = 0; sample < bufferSize; sample++) {
      // make output equal to the same as the input
      // output1[outputFront] = remoteAudioBuffer[sample];
      // output2[outputFront] = remoteAudioBuffer[sample];
      // outputFront = (outputFront+1)%(txrxBufferSize);
      output1.enqueue(remoteAudioBuffer[sample]);
      output2.enqueue(remoteAudioBuffer[sample]);
    }
    bytesReceived += remoteAudioBuffer.length*4;
  }
}

/*
// Receives audio clip
*/
function receiveClipData() {
  return function onmessage(event){
    var data = new Uint8ClampedArray(event.data);
    var blob = new Blob([data], { 'type' : 'audio/ogg; codecs=opus' });
    receiveAudio(blob);
  }
}

/*
// Receives video stream (images)
*/
// function receiveVideoData() {
//   var buf, count;
//
//   return function onmessage(event){
//     if (typeof event.data !== 'object') {
//       // console.log(event.data);
//       buf = window.buf = new Uint8ClampedArray(parseInt(event.data));
//       count = 0;
//       // console.log('Expecting a total of ' + buf.byteLength + ' bytes');
//       return;
//     }
//
//     var data = new Uint8ClampedArray(event.data);
//     buf.set(data, count);
//     count += data.byteLength;
//
//     if(count === buf.byteLength) {
//       renderPhoto(buf);
//     }
//
//     bytesReceived += data.byteLength;
//   }
// }

function receiveVideoData() {
  var buf = '';
  var bufEmpty = true;

  return function onmessage(event){
    if (event.data.substring(0,5) === 'data:') {
      if(!bufEmpty) {
        renderPhoto(buf);
        bufEmpty = true;
        buf = '';
      }
      // console.log(event.data);

      // console.log('Expecting a total of ' + buf.byteLength + ' bytes');
    }

    buf = buf.concat(event.data);
    bufEmpty = false;

    var blob = new Blob([event.data], {type: 'text/plain'});
    bytesReceived += blob.size;
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
  videoDataChannel.close();
}

function logError(err) {
  console.log(err.toString(), err);
}

function startBuffer() {
  audioContext = new AudioContext();
  audioContextSource = audioContext.createMediaStreamSource(localStream);
  scriptNode = audioContext.createScriptProcessor(bufferSize, 2, 2);

  // Listens to the audiodata
  scriptNode.onaudioprocess = function(e) {
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
    bytesSent += input.length * 4;

    // if(outputFront == outputEnd){
      // console.log(outputEnd);
    if(output1.length() == 0){

    }
    else {
      var outputBuffer1 = e.outputBuffer.getChannelData(0);
      var outputBuffer2 = e.outputBuffer.getChannelData(1);
      for (var sample = 0; sample < bufferSize; sample++) {
        // make output equal to the same as the input
        // outputBuffer1[sample] = output1[outputEnd];
        // outputBuffer2[sample] = output2[outputEnd];
        // outputEnd = (outputEnd+1)%(txrxBufferSize);
        outputBuffer1[sample] = output1.dequeue();
        outputBuffer2[sample] = output2.dequeue();
      }
    }
  }
}

function changeBuffer() {
  bufferSize = document.getElementById('bufferSizeSelector').value;
  txrxBufferSize = bufferSize*10;
  // output1 = new Float32Array(txrxBufferSize);
  // output2 = new Float32Array(txrxBufferSize);
  // outputFront = txrxBufferSize;
  // outputEnd = 0;
  output1 = new AudioSampleQueue(txrxBufferSize);
  output2 = new AudioSampleQueue(txrxBufferSize);
  console.log(bufferSize);
}

// function sendImage() {
//   var CHUNK_LEN = 64000;
//   var img = localContext.getImageData(0, 0, photoContextW, photoContextH);
//   var len = img.data.byteLength;
//   var n = len / CHUNK_LEN | 0;
//
//   // console.log('Sending a total of ' + len + ' byte(s)');
//   videoDataChannel.send(len);
//   // split the photo and send in chunks of about 64KB
//   for (var i = 0; i < n; i++) {
//     var start = i * CHUNK_LEN,
//     end = (i + 1) * CHUNK_LEN;
//     // console.log(start + ' - ' + (end - 1));
//     videoDataChannel.send(img.data.subarray(start, end));
//   }
//
//   // send the reminder, if any
//   if (len % CHUNK_LEN) {
//     // console.log('last ' + len % CHUNK_LEN + ' byte(s)');
//     videoDataChannel.send(img.data.subarray(n * CHUNK_LEN));
//   }
//
//   bytesSent += len;
// }

function sendImage() {
  var CHUNK_LEN = 6400;
  var imgUrl = localCanvas.toDataURL('image/jpeg', 0.3);
  var len = imgUrl.length;
  var n = len / CHUNK_LEN | 0;

  // console.log('Sending a total of ' + len + ' character(s)');
  // split the url and send in chunks of about 64KB
  for (var i = 0; i < n; i++) {
    var start = i * CHUNK_LEN,
    end = (i + 1) * CHUNK_LEN;
    // console.log(start + ' - ' + (end - 1));
    videoDataChannel.send(imgUrl.substring(start, end));
  }

  // send the reminder, if any
  if (len % CHUNK_LEN) {
    // console.log('last ' + len % CHUNK_LEN + ' byte(s)');
    videoDataChannel.send(imgUrl.substring(n * CHUNK_LEN));
  }

  var blob = new Blob([imgUrl], {type: 'text/plain'});
  bytesSent += blob.size;
}

// function renderPhoto(data) {
//   var img = remoteContext.createImageData(photoContextW, photoContextH);
//   img.data.set(data);
//   remoteContext.putImageData(img, 0, 0);
// }

function renderPhoto(dataUrl) {
  var img = new Image();
  img.src = dataUrl;
  img.onload = function() {
    remoteContext.drawImage(img, 0, 0, photoContextW*2, photoContextH*2);
  }
}

function draw() {
  localContext.drawImage(localVideo, 0, 0, localCanvas.width, localCanvas.height);
  sendImage();
  setTimeout(draw, 30);
}

function printBitRate() {
  bytesReceivedTxt.innerHTML = bytesReceived*8;
  bytesSentTxt.innerHTML = bytesSent*8;
  bytesReceived = 0;
  bytesSent = 0;
  setTimeout(printBitRate, 1000);
}
