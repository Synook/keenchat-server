DROP TABLE IF EXISTS user;
CREATE TABLE user (
    user_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(64) NOT NULL,
    password VARCHAR(64) NOT NULL,
    status INTEGER NOT NULL DEFAULT 1,
    UNIQUE (username)
);

DROP TABLE IF EXISTS user_push;
CREATE TABLE user_push (
    user_id INTEGER NOT NULL,
    push_id TEXT NOT NULL,
    PRIMARY KEY (user_id, push_id),
    CONSTRAINT fk_user_push_user
        FOREIGN KEY (user_id) REFERENCES user (user_id)
        ON DELETE CASCADE
);

DROP TABLE IF EXISTS channel;
CREATE TABLE channel (
    channel_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    title VARCHAR(64) NOT NULL,
    description TEXT NOT NULL
);
INSERT INTO channel (title, description)
VALUES
    ("General", "General discussion."),
    ("Code", "Electric sheep dreams.")
;

DROP TABLE IF EXISTS message;
CREATE TABLE message (
    message_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    message_text TEXT NOT NULL,
    time INTEGER NOT NULL,
    CONSTRAINT fk_message_channel
        FOREIGN KEY (channel_id) REFERENCES channel (channel_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_message_user
        FOREIGN KEY (user_id) REFERENCES user (user_id)
        ON DELETE CASCADE
);

DROP TABLE IF EXISTS auth_token;
CREATE TABLE auth_token (
    token_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_value VARCHAR(64) NOT NULL,
    creation_time INTEGER NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    CONSTRAINT fk_auth_token_user
        FOREIGN KEY (user_id) REFERENCES user (user_id)
        ON DELETE CASCADE
);