# Keenchat API

The new Keenchat REST API has channels, and an authenticated post mechanism. There is also a companion Websockets server than runs concurrently.

## REST API

The REST API consists of the following endpoints:

- **POST /auth** - `{username : String, password : String}` to `{token_value : String}`. This endpoint is used to log in to the system - sending valid credentials will cause the server to respond with an *authentication token* which can be used to verify future API calls. *Not really RESTful.*

- **GET|POST /user[/:id]**. A standard REST endpoint for users. The resource is of the form `{id : Integer, username : String, password : String}`, however the `password` is always omitted when the resource is sent from the server. Sending a POST request will cause a new user to be created; to send messages as that user an authentication token must be generated.

- **GET|POST|PUT|DELETE /channel[/:id]**. Standard REST, with the resource `{id : Integer, title : String, description : String}`. Authentication required to create new channels. *POST/PUT/DELETE not quite ready yet.*

- **GET|POST /message[:/id]**. Standard REST, with resource `{id : Integer, channel_id : Integer, user_id : Integer, message_text : String, time : Integer}`. The `channel_id` and `user_id` are foreign keys to the user and channel resources. Messages from specified channels and users can be fetched by including them as query string parameters, e.g. `channel_id=1`. In order to POST messages, an auth query string parameter **must** be included, of the form `auth=<auth_token>`.

## Websockets API

In order to support real-time communication, the server also runs a web sockets API in conjunction with the main HTTP server. The websockets server supports bi-directional data transfer, and passes entire resources along with it. Use of the websockets API is necessary in order to support real-time functionality, including new message detection and channel user lists.

### Events the server sends

- **post user**. Indicates a new user has been created, and contains a *user* resource (the new user).
- **post message**. Indicates a new message has been created, containing the *message* resource.
- **channel movement**. Indicates that the online user composition of a channel has changed. Contains `{channel_id : Integer, users : [Integer]}`, where `channel_id` is the relevant channel, and `users` is the new list of `user_id`s of the users currently in the channel.
- **(start|stop) typing**. Indicates that a user has started/stopped typing in a channel. Sends `{user_id : Integer, channel_id : Integer}`.
- **refresh page**. Indicates that the web client has an update, and the page should refresh. *Not really used*.

### Events to send to the server

- **connection**. Indicates the client has connected. No data. Many websocket libraries will send this automatically. 

(TBC...)