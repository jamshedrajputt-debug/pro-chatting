const socket = io(window.location.origin);
let user = "";
let avatar = "";
let recipient = "";
let peerConnection;
let localStream;
let currentCallTarget = "";
let incomingCall = false;
let pendingOffer = null;
let typingTimer;
let editingMessageId = null;
let savedUsername = localStorage.getItem("savedUsername") || "";
let publicKeys = {};
let privateKey = null;
let myPublicKey = null;
let myPublicKeyString = "";
let inactivityTimer;
const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes
let isRecordingHold = false;
let recordStartX = 0;
let recordCancelThreshold = 80;
let recordingCancelled = false;

function editMessage(messageId) {
    const messageDiv = document.querySelector(`[data-id="${messageId}"]`);
    if (!messageDiv) return;

    const bubble = messageDiv.querySelector('.bubble');
    const originalText = bubble.querySelector('div').innerText;

    bubble.innerHTML = `
        <input type="text" value="${originalText}" class="edit-input" id="editInput">
        <button onclick="saveEdit('${messageId}')" class="save-edit-btn">Save</button>
        <button onclick="cancelEdit()" class="cancel-edit-btn">Cancel</button>
    `;

    editingMessageId = messageId;
    document.getElementById('editInput').focus();
}

function saveEdit(messageId) {
    const newText = document.getElementById('editInput').value.trim();
    if (!newText) return;

    socket.emit("editMessage", { id: messageId, newText });
    cancelEdit();
}

function cancelEdit() {
    if (editingMessageId) {
        socket.emit("join", user); // Reload messages
        editingMessageId = null;
    }
}

function unsendMessage(messageId) {
    if (!confirm("Unsend this message? This cannot be undone.")) {
        return;
    }
    socket.emit("deleteMessage", { id: messageId });
    const messageDiv = document.querySelector(`[data-id="${messageId}"]`);
    if (messageDiv) {
        const bubble = messageDiv.querySelector('.bubble');
        if (bubble) bubble.innerHTML = `<div class="deleted-message">This message was unsent.</div>`;
    }
}

async function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function resolveAvatarValue(urlInputId, fileInputId, fallbackUsername) {
    const url = document.getElementById(urlInputId).value.trim();
    const fileInput = document.getElementById(fileInputId);
    if (fileInput && fileInput.files && fileInput.files[0]) {
        return await fileToDataUrl(fileInput.files[0]);
    }
    if (url) {
        return url;
    }
    return getDefaultAvatar(fallbackUsername);
}

function toggleEmojiPicker() {
    const picker = document.getElementById("emojiPicker");
    picker.style.display = picker.style.display === "block" ? "none" : "block";
}

function insertEmoji(emoji) {
    const msgInput = document.getElementById("msg");
    msgInput.value += emoji;
    msgInput.focus();
}

function closeEmojiPicker() {
    document.getElementById("emojiPicker").style.display = "none";
}

function startRecordingHold(event) {
    event.preventDefault();
    if (isRecordingHold || !recipient) return;
    if (!privateKey || !myPublicKey) {
        alert("Secure messaging is unavailable because the account keys are missing.");
        return;
    }
    isRecordingHold = true;
    recordingCancelled = false;
    recordStartX = event.touches ? event.touches[0].clientX : event.clientX;
    document.getElementById("recordBtn").innerText = "Release to Send";
    beginRecording();
}

function stopRecordingHold(event) {
    if (!isRecordingHold) return;
    const currentX = event.changedTouches ? event.changedTouches[0].clientX : event.clientX;
    if (recordStartX - currentX > recordCancelThreshold) {
        recordingCancelled = true;
    }
    isRecordingHold = false;
    document.getElementById("recordBtn").innerText = "Hold to Record";
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
    }
}

function cancelRecordingHold() {
    if (!isRecordingHold) return;
    recordingCancelled = true;
    isRecordingHold = false;
    document.getElementById("recordBtn").innerText = "Hold to Record";
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
    }
}

async function sendRecordedAudio() {
    if (!recipient) {
        alert("Choose a recipient before sending an audio message.");
        return;
    }
    if (!recordedAudioBlob) {
        return;
    }
    try {
        const recipientPublicKey = await getPublicKeyFor(recipient);
        const base64Audio = await blobToBase64(recordedAudioBlob);
        const encrypted = await encryptMessage(base64Audio, recipientPublicKey, myPublicKey, recipient);
        const tempId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

        socket.emit("message", {
            to: recipient,
            type: "audio",
            ciphertext: encrypted.ciphertext,
            iv: encrypted.iv,
            encryptedKeys: encrypted.encryptedKeys,
            tempId
        });

        clearRecording();
    } catch (err) {
        console.error(err);
        alert(err.message || "Unable to send audio message.");
    }
}

async function deleteAccount() {
    const password = document.getElementById("oldPass").value;
    if (!password) {
        alert("Please enter your current password to delete your account.");
        return;
    }
    if (!confirm("Delete your account permanently? This cannot be undone.")) {
        return;
    }

    const response = await fetch("/deleteAccount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password })
    });
    const data = await response.json();
    if (!data.success) {
        alert(data.error);
        return;
    }
    alert("Your account has been deleted.");
    localStorage.removeItem("savedUsername");
    logout();
}

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        logout();
        alert("You have been logged out due to inactivity.");
    }, INACTIVITY_TIMEOUT);
}

function addActivityListeners() {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => {
        document.addEventListener(event, resetInactivityTimer, true);
    });
}

function getDefaultAvatar(username) {
    return `https://i.pravatar.cc/150?u=${encodeURIComponent(username)}`;
}

window.onload = () => {
    remoteAudio = document.getElementById("remoteAudio");
    updateCallButtons("none");
    if (savedUsername) {
        document.getElementById("user").value = savedUsername;
    }
};

async function register() {
    const username = document.getElementById("user").value.trim();
    const password = document.getElementById("pass").value;
    const secret = document.getElementById("secret").value;

    if (!username || !password) {
        alert("Username and password are required.");
        return;
    }

    if (username.length < 3 || username.length > 20) {
        alert("Username must be 3-20 characters.");
        return;
    }

    if (password.length < 6) {
        alert("Password must be at least 6 characters.");
        return;
    }

    if (!secret) {
        alert("Secret code is required.");
        return;
    }

    try {
        const avatarValue = await resolveAvatarValue("avatarUrl", "avatarFile", username);
        const keyPair = await crypto.subtle.generateKey(
            {
                name: "RSA-OAEP",
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: "SHA-256"
            },
            true,
            ["encrypt", "decrypt"]
        );

        const publicKey = await exportPublicKey(keyPair.publicKey);
        const privateKeyBytes = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
        const encryptedPrivate = await encryptPrivateKey(privateKeyBytes, password);

        const response = await fetch("/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username,
                password,
                secret,
                avatar: avatarValue,
                publicKey,
                encryptedPrivateKey: encryptedPrivate.encrypted,
                privateKeySalt: encryptedPrivate.salt,
                privateKeyIv: encryptedPrivate.iv
            })
        });
        const data = await response.json();
        alert(data.success ? "Registered! You can now login." : data.error);
    } catch (err) {
        console.error(err);
        alert("Registration failed. Please try again.");
    }
}

async function login() {
    const username = document.getElementById("user").value.trim();
    const password = document.getElementById("pass").value;

    if (!username || !password) {
        alert("Username and password are required.");
        return;
    }

    try {
        const response = await fetch("/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        if (!data.success) {
            alert(data.error);
            return;
        }

        user = username;
        avatar = data.avatar || getDefaultAvatar(username);
        localStorage.setItem("savedUsername", user);
        savedUsername = user;

        if (data.encryptedPrivateKey && data.privateKeySalt && data.privateKeyIv) {
            try {
                privateKey = await decryptPrivateKey(data.encryptedPrivateKey, password, data.privateKeySalt, data.privateKeyIv);
                if (data.publicKey) {
                    myPublicKeyString = data.publicKey;
                    myPublicKey = await importPublicKey(myPublicKeyString);
                }
            } catch (err) {
                privateKey = null;
                myPublicKey = null;
                alert("Logged in, but secure messaging cannot be enabled. Check your password or register a new account.");
            }
        } else {
            privateKey = null;
            myPublicKey = null;
            alert("Logged in, but this account does not support encrypted messaging. Register a new secure account.");
        }

        enterChat();
    } catch (err) {
        console.error(err);
        alert("Login failed. Please try again.");
    }
}

function logout() {
    endCall();
    if (socket && socket.connected) {
        socket.disconnect();
    }

    user = "";
    avatar = "";
    recipient = "";
    privateKey = null;
    myPublicKey = null;
    myPublicKeyString = "";
    publicKeys = {};

    document.getElementById("auth").style.display = "block";
    document.getElementById("chat").style.display = "none";
    document.getElementById("messages").innerHTML = "";
    document.getElementById("welcome").innerText = "";
    document.getElementById("currentChat").innerText = "Select a user to start private chat";
    document.getElementById("user").value = localStorage.getItem("savedUsername") || "";
    document.getElementById("pass").value = "";
}

function clearChat() {
    if (!recipient) {
        alert("Select a recipient first.");
        return;
    }
    if (!confirm("This will permanently delete all messages with " + recipient + ". This cannot be undone. Continue?")) {
        return;
    }

    fetch("/clearMessages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, target: recipient })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            document.getElementById("messages").innerHTML = "";
            socket.emit("join", user); // Reload messages
        } else {
            alert(data.error);
        }
    })
    .catch(err => {
        console.error(err);
        alert("Failed to clear messages.");
    });
}

function enterChat() {
    document.getElementById("auth").style.display = "none";
    document.getElementById("chat").style.display = "flex";
    document.getElementById("welcome").innerText = user;
    document.getElementById("headerAvatar").src = avatar || "https://i.pravatar.cc/40";
    document.getElementById("currentChat").innerText = recipient ? `Chatting with ${recipient}` : "Select a user to start private chat";
    if (!socket.connected) {
        socket.connect();
    }
    socket.emit("join", user);
    addActivityListeners();
    resetInactivityTimer();
}

function showProfile() {
    document.getElementById("profileModal").style.display = "block";
}

function closeProfile() {
    document.getElementById("profileModal").style.display = "none";
}

async function updateProfile() {
    const newAvatarUrl = document.getElementById("newAvatarUrl").value.trim();
    let avatarBase64 = avatar;
    const avatarFile = document.getElementById("newAvatarFile");
    if (newAvatarUrl || (avatarFile && avatarFile.files && avatarFile.files[0])) {
        avatarBase64 = await resolveAvatarValue("newAvatarUrl", "newAvatarFile", user);
    }

    const newPassword = document.getElementById("newPass").value;
    const oldPassword = document.getElementById("oldPass").value;
    const newUsername = document.getElementById("newUser").value.trim();
    let encryptedPrivate = null;

    if (newPassword) {
        if (!privateKey) {
            alert("Cannot change password because the encrypted private key is unavailable.");
            return;
        }

        const exportedPrivate = await exportPrivateKey(privateKey);
        const privateBytes = base64ToArrayBuffer(exportedPrivate);
        encryptedPrivate = await encryptPrivateKey(privateBytes, newPassword);
    }

    const payload = {
        username: user,
        oldPassword,
        newUsername,
        newPassword,
        avatar: avatarBase64
    };

    if (encryptedPrivate) {
        payload.encryptedPrivateKey = encryptedPrivate.encrypted;
        payload.privateKeySalt = encryptedPrivate.salt;
        payload.privateKeyIv = encryptedPrivate.iv;
    }

    const response = await fetch("/updateProfile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    const data = await response.json();

    if (!data.success) {
        alert(data.error);
        return;
    }

    user = data.newUsername || user;
    avatar = data.avatar || getDefaultAvatar(user);
    localStorage.setItem("savedUsername", user);
    document.getElementById("welcome").innerText = user;
    document.getElementById("headerAvatar").src = avatar || getDefaultAvatar(user);
    document.getElementById("currentChat").innerText = recipient ? `Chatting with ${recipient}` : "Select a user to start private chat";
    document.getElementById("user").value = user;

    if (newPassword && encryptedPrivate) {
        privateKey = await decryptPrivateKey(encryptedPrivate.encrypted, newPassword, encryptedPrivate.salt, encryptedPrivate.iv);
    }

    closeProfile();
    alert("Profile updated!");
}

function setRecipient() {
    const target = document.getElementById("targetUser").value.trim();
    if (!target) {
        alert("Enter the username you want to chat with.");
        return;
    }
    if (target === user) {
        alert("You cannot chat with yourself.");
        return;
    }

    recipient = target;
    document.getElementById("currentChat").innerText = `Chatting with ${recipient}`;
    document.getElementById("messages").innerHTML = "";
    socket.emit("join", user);
}

function updateCallButtons(mode) {
    const acceptBtn = document.getElementById("acceptCallBtn");
    const declineBtn = document.getElementById("declineCallBtn");
    const endBtn = document.getElementById("endCallBtn");

    if (mode === "incoming") {
        acceptBtn.style.display = "inline-flex";
        declineBtn.style.display = "inline-flex";
        endBtn.style.display = "none";
    } else if (mode === "active") {
        acceptBtn.style.display = "none";
        declineBtn.style.display = "none";
        endBtn.style.display = "inline-flex";
    } else {
        acceptBtn.style.display = "none";
        declineBtn.style.display = "none";
        endBtn.style.display = "none";
    }
}

function updateRecordingUi(isRecording) {
    const recordBtn = document.querySelector(".record-btn");
    const preview = document.getElementById("audioPreviewContainer");
    const statusText = document.getElementById("audioStatus");

    if (isRecording) {
        recordBtn.innerText = "Stop Recording";
        statusText.innerText = "Recording...";
        preview.style.display = "flex";
    } else {
        recordBtn.innerText = "Start Recording";
        if (recordedAudioBlob) {
            statusText.innerText = "Recorded clip ready";
            preview.style.display = "flex";
        } else {
            preview.style.display = "none";
        }
    }
}

function renderOnlineUsers(list) {
    document.getElementById("onlineCount").innerText = list.length;
    const container = document.getElementById("onlineUsersList");
    container.innerHTML = "";
    list.forEach((username) => {
        if (username === user) return;
        const item = document.createElement("li");
        item.className = "online-user";
        item.innerText = username;
        item.onclick = () => {
            recipient = username;
            document.getElementById("targetUser").value = recipient;
            document.getElementById("currentChat").innerText = `Chatting with ${recipient}`;
            document.getElementById("messages").innerHTML = "";
            socket.emit("join", user);
        };
        container.appendChild(item);
    });
}

function handleKeyPress(event) {
    if (event.key === "Enter") {
        sendMsg();
    } else if (recipient) {
        socket.emit("typing", recipient);
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => socket.emit("stopTyping", recipient), 1000);
    }
}

async function toggleRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return alert("Audio recording is not supported in this browser.");
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            recordedAudioBlob = new Blob(audioChunks, { type: "audio/webm" });
            const audioUrl = URL.createObjectURL(recordedAudioBlob);
            const audioPreview = document.getElementById("audioPreview");
            audioPreview.src = audioUrl;
            updateRecordingUi(false);
            stream.getTracks().forEach((track) => track.stop());
        };

        mediaRecorder.start();
        updateRecordingUi(true);
    } catch (err) {
        console.error(err);
        alert("Unable to start audio recording.");
    }
}

async function beginRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Audio recording is not supported in this browser.");
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            recordedAudioBlob = new Blob(audioChunks, { type: "audio/webm" });
            const audioUrl = URL.createObjectURL(recordedAudioBlob);
            const audioPreview = document.getElementById("audioPreview");
            audioPreview.src = audioUrl;
            updateRecordingUi(false);
            stream.getTracks().forEach((track) => track.stop());
            if (!recordingCancelled) {
                await sendRecordedAudio();
            } else {
                clearRecording();
            }
        };

        mediaRecorder.start();
        updateRecordingUi(true);
    } catch (err) {
        console.error(err);
        alert("Unable to start audio recording.");
    }
}

function clearRecording() {
    recordedAudioBlob = null;
    const audioPreview = document.getElementById("audioPreview");
    audioPreview.src = "";
    updateRecordingUi(false);
}

async function sendAudioMsg() {
    if (!recipient) {
        alert("Choose a recipient before sending an audio message.");
        return;
    }
    if (!recordedAudioBlob) {
        alert("Record an audio clip first.");
        return;
    }
    if (!privateKey || !myPublicKey) {
        alert("Secure messaging is unavailable because the account keys are missing.");
        return;
    }

    try {
        const recipientPublicKey = await getPublicKeyFor(recipient);
        const base64Audio = await blobToBase64(recordedAudioBlob);
        const encrypted = await encryptMessage(base64Audio, recipientPublicKey, myPublicKey, recipient);
        const tempId = Date.now().toString();

        socket.emit("message", {
            to: recipient,
            type: "audio",
            ciphertext: encrypted.ciphertext,
            iv: encrypted.iv,
            encryptedKeys: encrypted.encryptedKeys,
            tempId
        });

        clearRecording();
        document.getElementById("msg").value = "";
    } catch (err) {
        console.error(err);
        alert(err.message || "Unable to send audio message.");
    }
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function sendMsg() {
    const msg = document.getElementById("msg").value.trim();
    if (!msg) return;
    if (!recipient) {
        alert("Choose a user to chat with first.");
        return;
    }
    if (!privateKey || !myPublicKey) {
        alert("Secure messaging is unavailable because the account keys are missing.");
        return;
    }

    try {
        const recipientPublicKey = await getPublicKeyFor(recipient);
        const encrypted = await encryptMessage(msg, recipientPublicKey, myPublicKey, recipient);
        const tempId = Date.now().toString();

        socket.emit("message", {
            to: recipient,
            ciphertext: encrypted.ciphertext,
            iv: encrypted.iv,
            encryptedKeys: encrypted.encryptedKeys,
            tempId
        });

        document.getElementById("msg").value = "";
        socket.emit("stopTyping", recipient);
    } catch (err) {
        console.error(err);
        alert(err.message || "Unable to send encrypted message.");
    }
}

socket.on("loadMessages", async (msgs) => {
    document.getElementById("messages").innerHTML = "";
    for (const message of msgs) {
        if (isMessageVisible(message)) {
            const decrypted = await tryDecryptMessage(message);
            if (decrypted) addMessage(decrypted);
        }
    }
});

socket.on("message", async (data) => {
    if (!isMessageVisible(data)) return;
    const decrypted = await tryDecryptMessage(data);
    if (decrypted) addMessage(decrypted);
});

socket.on("onlineUsers", renderOnlineUsers);

socket.on("typing", (userTyping) => {
    if (userTyping !== user) {
        document.getElementById("typingIndicator").style.display = "block";
        document.getElementById("typingIndicator").innerText = `${userTyping} is typing...`;
    }
});

socket.on("stopTyping", () => {
    document.getElementById("typingIndicator").style.display = "none";
});

socket.on("errorMessage", (message) => {
    alert(message);
});

socket.on("messageEdited", (data) => {
    const messageDiv = document.querySelector(`[data-id="${data.id}"]`);
    if (messageDiv) {
        const bubble = messageDiv.querySelector('.bubble');
        const contentDiv = bubble.querySelector('div');
        if (contentDiv) {
            contentDiv.innerHTML = `${data.newText} <span class="edited">(edited)</span>`;
        }
    }
});

socket.on("messageDeleted", (data) => {
    const messageDiv = document.querySelector(`[data-id="${data.id}"]`);
    if (messageDiv) {
        const bubble = messageDiv.querySelector('.bubble');
        if (bubble) {
            bubble.innerHTML = `<div class="deleted-message">This message was unsent.</div>`;
        }
    }
});

function isMessageVisible(message) {
    if (!message.from || !message.to) return false;
    if (message.from !== user && message.to !== user) return false;
    if (!recipient) return true;
    return message.from === recipient || message.to === recipient;
}

async function tryDecryptMessage(message) {
    // Handle old format messages (unencrypted)
    if (message.msg && !message.ciphertext) {
        return {
            from: message.user || message.from,
            to: message.to || "",
            msg: message.msg,
            avatar: message.avatar || "",
            time: message.time,
            type: "text"
        };
    }

    if (message.audioBase64) {
        return message;
    }
    if (message.msg && message.type !== "audio") {
        return message;
    }

    if (!message.encryptedKeys || !message.encryptedKeys[user]) {
        return {
            ...message,
            msg: "[Encrypted message cannot be decrypted]"
        };
    }

    try {
        const plaintext = await decryptMessage(message);
        if (message.type === "audio") {
            return { ...message, audioBase64: plaintext };
        }
        return { ...message, msg: plaintext };
    } catch (err) {
        console.error("Decrypt failed", err);
        return { ...message, msg: "[Cannot decrypt message]" };
    }
}

function processMentions(text) {
    return text.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
}

function addMessage(data) {
    const div = document.createElement("div");
    const isMe = data.from === user;
    div.className = "msg " + (isMe ? "me" : "other");
    div.setAttribute("data-id", data.tempId || data.id || Date.now());

    const sender = isMe ? "You" : data.from;
    const targetInfo = isMe ? `<div class="target">to ${data.to}</div>` : "";
    const time = data.time ? new Date(data.time).toLocaleTimeString() : new Date().toLocaleTimeString();
    let contentHtml = "";

    if (data.type === "audio") {
        if (data.audioBase64) {
            const audioSrc = `data:audio/webm;base64,${data.audioBase64}`;
            contentHtml = `<audio controls src="${audioSrc}"></audio>`;
        } else {
            contentHtml = `<div>[Audio message could not be loaded]</div>`;
        }
    } else {
        let msgText = data.msg || "[No message]";
        if (data.edited) {
            msgText += ' <span class="edited">(edited)</span>';
        }
        msgText = processMentions(msgText);
        contentHtml = `<div>${msgText}</div>`;
    }

    const messageId = data.id || data.tempId || Date.now();
    div.setAttribute("data-id", messageId);
    const editButton = isMe && data.type !== "audio" ? `<button onclick="editMessage('${messageId}')" class="edit-btn">Edit</button>` : "";
    const deleteButton = isMe ? `<button onclick="unsendMessage('${messageId}')" class="delete-btn">Delete</button>` : "";

    div.innerHTML = `
        <img src="${data.avatar || "https://i.pravatar.cc/40"}" class="avatar small">
        <div class="bubble">
            <div class="name">${sender}</div>
            ${targetInfo}
            ${contentHtml}
            <div class="message-actions">${editButton}${deleteButton}</div>
            <div class="time">${time}</div>
        </div>
    `;

    document.getElementById("messages").appendChild(div);
    document.getElementById("messages").scrollTop = document.getElementById("messages").scrollHeight;
}

function randomBytes(length) {
    return window.crypto.getRandomValues(new Uint8Array(length));
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

async function deriveAesKey(password, salt) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        "PBKDF2",
        false,
        ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt,
            iterations: 250000,
            hash: "SHA-256"
        },
        baseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

async function encryptPrivateKey(privateKeyBytes, password) {
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const aesKey = await deriveAesKey(password, salt);
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        aesKey,
        privateKeyBytes
    );
    return {
        encrypted: arrayBufferToBase64(ciphertext),
        salt: arrayBufferToBase64(salt),
        iv: arrayBufferToBase64(iv)
    };
}

async function decryptPrivateKey(encryptedBase64, password, saltBase64, ivBase64) {
    const salt = base64ToArrayBuffer(saltBase64);
    const iv = base64ToArrayBuffer(ivBase64);
    const ciphertext = base64ToArrayBuffer(encryptedBase64);
    const aesKey = await deriveAesKey(password, salt);
    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(iv) },
        aesKey,
        ciphertext
    );
    return importPrivateKey(arrayBufferToBase64(decrypted));
}

async function exportPublicKey(key) {
    const spki = await crypto.subtle.exportKey("spki", key);
    return arrayBufferToBase64(spki);
}

async function exportPrivateKey(key) {
    const pkcs8 = await crypto.subtle.exportKey("pkcs8", key);
    return arrayBufferToBase64(pkcs8);
}

async function importPublicKey(base64) {
    return crypto.subtle.importKey(
        "spki",
        base64ToArrayBuffer(base64),
        { name: "RSA-OAEP", hash: "SHA-256" },
        true,
        ["encrypt"]
    );
}

async function importPrivateKey(base64) {
    return crypto.subtle.importKey(
        "pkcs8",
        base64ToArrayBuffer(base64),
        { name: "RSA-OAEP", hash: "SHA-256" },
        true,
        ["decrypt"]
    );
}

async function getPublicKeyFor(username) {
    if (publicKeys[username]) {
        return publicKeys[username];
    }
    const response = await fetch(`/publicKey/${encodeURIComponent(username)}`);
    const data = await response.json();
    if (!data.success) {
        throw new Error(data.error || "Unable to fetch public key");
    }
    const imported = await importPublicKey(data.publicKey);
    publicKeys[username] = imported;
    return imported;
}

async function encryptMessage(plaintext, recipientPublicKey, senderPublicKey, recipientUsername) {
    const aesKey = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
    const iv = randomBytes(12);
    const encoded = new TextEncoder().encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, encoded);
    const rawAesKey = await crypto.subtle.exportKey("raw", aesKey);

    const encryptedKeys = {};
    encryptedKeys[recipientUsername] = arrayBufferToBase64(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, recipientPublicKey, rawAesKey));
    encryptedKeys[user] = arrayBufferToBase64(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, senderPublicKey, rawAesKey));

    return {
        ciphertext: arrayBufferToBase64(ciphertext),
        iv: arrayBufferToBase64(iv),
        encryptedKeys
    };
}

async function decryptMessage(message) {
    const encryptedKeyBase64 = message.encryptedKeys[user];
    if (!encryptedKeyBase64) throw new Error("Missing decryption key");

    const encryptedKey = base64ToArrayBuffer(encryptedKeyBase64);
    const rawAesKey = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, encryptedKey);
    const aesKey = await crypto.subtle.importKey("raw", rawAesKey, "AES-GCM", false, ["decrypt"]);
    const iv = base64ToArrayBuffer(message.iv);
    const ciphertext = base64ToArrayBuffer(message.ciphertext);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(iv) }, aesKey, ciphertext);
    return new TextDecoder().decode(decrypted);
}

function toBase64(file) {
    return new Promise((res, rej) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => res(reader.result);
        reader.onerror = err => rej(err);
    });
}

async function startAudioCall() {
    if (!user) {
        alert("Login first to start a voice call.");
        return;
    }
    if (currentCallTarget) {
        alert("A call is already in progress.");
        return;
    }

    const selectedUser = recipient || document.getElementById("targetUser").value.trim();
    if (!selectedUser) {
        alert("Select a recipient or enter a username first.");
        return;
    }
    if (selectedUser === user) {
        alert("You cannot call yourself.");
        return;
    }

    currentCallTarget = selectedUser;
    document.getElementById("callModal").style.display = "block";
    document.getElementById("callStatus").innerText = "Calling " + selectedUser + "...";

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        peerConnection = new RTCPeerConnection();

        localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
        peerConnection.ontrack = (event) => {
            if (remoteAudio) {
                remoteAudio.srcObject = event.streams[0];
            }
        };
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("iceCandidate", { candidate: event.candidate, to: selectedUser });
            }
        };

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit("callUser", { offer, to: selectedUser });
    } catch (err) {
        console.error(err);
        endCall();
    }
}

function endCall() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
        localStream = null;
    }
    document.getElementById("callModal").style.display = "none";
    updateCallButtons("none");
    if (currentCallTarget) {
        socket.emit("endCall", { to: currentCallTarget });
    }
    currentCallTarget = "";
    incomingCall = false;
    pendingOffer = null;
}

async function acceptCall() {
    if (!incomingCall || !pendingOffer || !currentCallTarget) return;

    document.getElementById("callStatus").innerText = "Connecting to " + currentCallTarget + "...";
    updateCallButtons("active");
    incomingCall = false;

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        peerConnection = new RTCPeerConnection();

        localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
        peerConnection.ontrack = (event) => {
            if (remoteAudio) {
                remoteAudio.srcObject = event.streams[0];
            }
        };
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("iceCandidate", { candidate: event.candidate, to: currentCallTarget });
            }
        };

        await peerConnection.setRemoteDescription(new RTCSessionDescription(pendingOffer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit("answerCall", { answer, to: currentCallTarget });
    } catch (err) {
        console.error(err);
        endCall();
    }
}

function declineCall() {
    if (currentCallTarget) {
        socket.emit("endCall", { to: currentCallTarget });
    }
    document.getElementById("callModal").style.display = "none";
    updateCallButtons("none");
    currentCallTarget = "";
    incomingCall = false;
    pendingOffer = null;
}

socket.on("callMade", async (data) => {
    currentCallTarget = data.from;
    pendingOffer = data.offer;
    incomingCall = true;
    document.getElementById("callModal").style.display = "block";
    document.getElementById("callStatus").innerText = "Incoming call from " + data.from;
    updateCallButtons("incoming");
});

socket.on("callAnswered", async (data) => {
    document.getElementById("callStatus").innerText = "Connected";
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
});

socket.on("iceCandidate", (data) => {
    if (peerConnection) {
        peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
});

socket.on("messageEdited", (data) => {
    const messageDiv = document.querySelector(`[data-id="${data.id}"]`);
    if (messageDiv) {
        const bubble = messageDiv.querySelector('.bubble');
        const contentDiv = bubble.querySelector('div');
        contentDiv.innerText = data.newText;
        if (data.edited) {
            contentDiv.innerHTML += ' <span class="edited">(edited)</span>';
        }
    }
});