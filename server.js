const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static("public"));
app.use(express.json({ limit: "10mb" }));

const usersFile = path.resolve(__dirname, "users.json");
const messagesFile = path.resolve(__dirname, "messages.json");

let users = {};
let messages = [];
let onlineUsers = {};
let userSockets = {};

function readJson(filePath, defaultValue) {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, "utf8");
            return JSON.parse(data);
        }
    } catch (err) {
        console.error(`Failed to read ${filePath}:`, err.message);
    }
    return defaultValue;
}

function saveJson(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error(`Failed to save ${filePath}:`, err.message);
    }
}

users = readJson(usersFile, {});
messages = readJson(messagesFile, []);

console.log(`Loaded ${Object.keys(users).length} users and ${messages.length} messages`);

function saveUsers() {
    saveJson(usersFile, users);
}

function saveMessages() {
    saveJson(messagesFile, messages);
}

app.get("/users", (req, res) => {
    return res.json({ success: true, users: Object.keys(users) });
});

app.post("/register", async (req, res) => {
    const { username, password, secret, avatar, publicKey, encryptedPrivateKey, privateKeySalt, privateKeyIv } = req.body;

    if (!username || !password || !publicKey || !encryptedPrivateKey || !privateKeySalt || !privateKeyIv) {
        return res.json({ error: "All registration fields are required" });
    }

    if (secret !== "23102002") {
        return res.json({ error: "Invalid secret code" });
    }

    if (users[username]) {
        return res.json({ error: "User exists" });
    }

    // Basic validation
    if (username.length < 3 || username.length > 20) {
        return res.json({ error: "Username must be 3-20 characters" });
    }
    if (password.length < 6) {
        return res.json({ error: "Password must be at least 6 characters" });
    }

    const hash = await bcrypt.hash(password, 10);
    users[username] = {
        password: hash,
        avatar: avatar || "",
        publicKey,
        encryptedPrivateKey,
        privateKeySalt,
        privateKeyIv
    };

    saveUsers();
    res.json({ success: true });
});

app.get("/publicKey/:username", (req, res) => {
    const username = req.params.username;
    const user = users[username];
    if (!user || !user.publicKey) {
        return res.json({ error: "Public key not found" });
    }
    res.json({ success: true, publicKey: user.publicKey, avatar: user.avatar || "" });
});

app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.json({ error: "Username and password are required" });
    }

    const user = users[username];
    if (!user) return res.json({ error: "User not found" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.json({ error: "Wrong password" });

    res.json({
        success: true,
        avatar: user.avatar || "",
        publicKey: user.publicKey || "",
        encryptedPrivateKey: user.encryptedPrivateKey || "",
        privateKeySalt: user.privateKeySalt || "",
        privateKeyIv: user.privateKeyIv || ""
    });
});

app.post("/clearMessages", (req, res) => {
    const { username, target } = req.body;
    if (!username || !target) {
        return res.json({ error: "Username and target required" });
    }

    const filteredMessages = messages.filter(msg => {
        if (msg.user) {
            return !(msg.user === username || (msg.to && msg.to === username));
        }
        return !(msg.from === username && msg.to === target) && !(msg.from === target && msg.to === username);
    });

    messages = filteredMessages;
    saveMessages();
    res.json({ success: true });
});

app.post("/deleteAccount", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.json({ error: "Username and password are required" });
    }
    const user = users[username];
    if (!user) return res.json({ error: "User not found" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.json({ error: "Incorrect password" });

    delete users[username];
    messages = messages.filter(msg => {
        if (msg.user) {
            return msg.user !== username;
        }
        return msg.from !== username && msg.to !== username;
    });

    saveUsers();
    saveMessages();
    res.json({ success: true });
});

io.on("connection", (socket) => {
    socket.on("join", (username) => {
        if (!username || !users[username]) {
            return socket.emit("errorMessage", "Invalid or unknown user");
        }

        if (socket.username && socket.username !== username) {
            delete onlineUsers[socket.username];
            delete userSockets[socket.username];
        }

        socket.username = username;
        onlineUsers[username] = true;
        userSockets[username] = socket.id;

        const privateMessages = messages.filter(
            (message) => {
                // Handle old format messages
                if (message.user) {
                    return message.user === username;
                }
                // New format
                return message.from === username || message.to === username;
            }
        );

        socket.emit("loadMessages", privateMessages);
        io.emit("onlineUsers", Object.keys(onlineUsers));
    });

    socket.on("disconnect", () => {
        if (socket.username) {
            delete onlineUsers[socket.username];
            delete userSockets[socket.username];
            io.emit("onlineUsers", Object.keys(onlineUsers));
        }
    });

    socket.on("message", (data) => {
        if (!socket.username) return;
        const { to, ciphertext, iv, encryptedKeys, tempId, type } = data;
        if (!ciphertext || !iv || !encryptedKeys || !to || to === socket.username) return;
        if (!users[to]) {
            return socket.emit("errorMessage", "Recipient not found");
        }

        if (!encryptedKeys[to] || !encryptedKeys[socket.username]) {
            return socket.emit("errorMessage", "Encrypted message keys are missing");
        }

        const messageId = tempId || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const message = {
            id: messageId,
            from: socket.username,
            to,
            type: type || "text",
            ciphertext,
            iv,
            encryptedKeys,
            tempId: messageId,
            avatar: users[socket.username].avatar || "",
            time: new Date().toISOString()
        };

        messages.push(message);
        saveMessages();

        socket.emit("message", message);
        const targetSocketId = userSockets[to];
        if (targetSocketId) {
            io.to(targetSocketId).emit("message", message);
        }
    });

    socket.on("typing", (to) => {
        if (!socket.username || !to || to === socket.username) return;
        const targetSocketId = userSockets[to];
        if (targetSocketId) {
            io.to(targetSocketId).emit("typing", socket.username);
        }
    });

    socket.on("stopTyping", (to) => {
        if (!socket.username || !to || to === socket.username) return;
        const targetSocketId = userSockets[to];
        if (targetSocketId) {
            io.to(targetSocketId).emit("stopTyping", socket.username);
        }
    });

    socket.on("callUser", (data) => {
        if (!socket.username || !data.to || data.to === socket.username) return;
        const targetSocketId = userSockets[data.to];
        if (targetSocketId) {
            io.to(targetSocketId).emit("callMade", { offer: data.offer, from: socket.username });
        }
    });

    socket.on("answerCall", (data) => {
        if (!socket.username || !data.to) return;
        const targetSocketId = userSockets[data.to];
        if (targetSocketId) {
            io.to(targetSocketId).emit("callAnswered", { answer: data.answer, from: socket.username });
        }
    });

    socket.on("iceCandidate", (data) => {
        if (!socket.username || !data.to) return;
        const targetSocketId = userSockets[data.to];
        if (targetSocketId) {
            io.to(targetSocketId).emit("iceCandidate", { candidate: data.candidate, from: socket.username });
        }
    });

    socket.on("editMessage", (data) => {
        if (!socket.username) return;
        const { id, newText } = data;
        const message = messages.find(m => m.id === id && m.from === socket.username);
        if (message) {
            message.msg = newText;
            message.edited = true;
            message.editedAt = new Date().toISOString();
            saveMessages();
            io.emit("messageEdited", { id, newText, edited: true, editedAt: message.editedAt });
        }
    });

    socket.on("deleteMessage", (data) => {
        if (!socket.username) return;
        const { id } = data;
        const messageIndex = messages.findIndex(m => m.id === id && m.from === socket.username);
        if (messageIndex !== -1) {
            const [removed] = messages.splice(messageIndex, 1);
            saveMessages();
            io.emit("messageDeleted", { id });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Pro Chat Secure server running on http://localhost:${PORT}`);
});