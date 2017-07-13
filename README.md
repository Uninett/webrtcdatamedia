# PeerAudio - WebRTC datachannel audio #

This WebRTC system attempts to apply the WebRTC datachannel to transmit uncompressed audio between peer-browsers.

The system attempts to mimic how current music collaboration tools transmit audio over IP-nettworks, i.e. uncompressed and unbuffered. The aim is to achive an audio connection with lower delay (and higher quality) compared to the standard audio channel in WebRTC. 

## The system ##
The system consists of erver and client parts.

### Server ###
A node.jo server is implemented to provider "rooms" for peers of clients to meet. `socket.io` is applied to implement room-support and simple "vanilla" forwarding of messages between room-members are performed.

Currently only two member per room is supported.

Server JavaScript-code is in `app.js`.

### Client ###
After loading the client page requires "vanilla" selection of a room name (of the user choice). When two clients have join a room, audio may be exchanged.

  * Batch forwarding: A peer may record an audio clip and forward to the other peer. Receiveing peer may play out the clip.
  * Realtime: A peer may initiate a live audiostream
  
All audio is forwarded across the WebRTC datachannel.

Client JavaScript-code is in `js/main.js`.

## Status ##
  
The system is **very much under development**, and currently not fully implemented.
