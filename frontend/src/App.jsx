import React, { useState, useEffect } from "react";
import axios from "axios";
import { io } from "socket.io-client";

const API = "https://your-backend-on-render.onrender.com";

export default function App() {
  const [view, setView] = useState("login");
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [username, setUsername] = useState("");
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (token) {
      axios
        .get(`${API}/api/messages`, { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => setMessages(res.data));
      const s = io(API, { auth: { token } });
      s.on("message", (msg) => setMessages((m) => [...m, msg]));
      setSocket(s);
      setView("chat");
      return () => s.disconnect();
    }
  }, [token]);

  function handleRegister(e) {
    e.preventDefault();
    const form = e.target;
    axios
      .post(`${API}/api/register`, {
        username: form.username.value,
        password: form.password.value,
      })
      .then(() => setView("login"))
      .catch(() => alert("Username taken"));
  }

  function handleLogin(e) {
    e.preventDefault();
    const form = e.target;
    axios
      .post(`${API}/api/login`, {
        username: form.username.value,
        password: form.password.value,
      })
      .then((res) => {
        setToken(res.data.token);
        localStorage.setItem("token", res.data.token);
        setUsername(form.username.value);
        setView("chat");
      })
      .catch(() => alert("Invalid credentials"));
  }

  function sendMessage(e) {
    e.preventDefault();
    if (text.trim()) {
      socket.emit("message", text);
      setText("");
    }
  }

  if (view === "register") {
    return (
      <div className="auth-form">
        <h2>Register</h2>
        <form onSubmit={handleRegister}>
          <input name="username" required placeholder="Username" />
          <input name="password" required placeholder="Password" type="password" />
          <button type="submit">Register</button>
        </form>
        <button onClick={() => setView("login")}>Have an account? Login</button>
      </div>
    );
  }

  if (view === "login") {
    return (
      <div className="auth-form">
        <h2>Login</h2>
        <form onSubmit={handleLogin}>
          <input name="username" required placeholder="Username" />
          <input name="password" required placeholder="Password" type="password" />
          <button type="submit">Login</button>
        </form>
        <button onClick={() => setView("register")}>No account? Register</button>
      </div>
    );
  }

  // Chat view
  return (
    <div className="chat-container">
      <h2>Chat Room</h2>
      <div className="messages">
        {messages.map((m, i) => (
          <div key={i}>
            <b>{m.username}</b>: {m.text} <small>{new Date(m.created_at).toLocaleTimeString()}</small>
          </div>
        ))}
      </div>
      <form onSubmit={sendMessage}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type message..."
        />
        <button type="submit">Send</button>
      </form>
      <button
        onClick={() => {
          setToken("");
          localStorage.removeItem("token");
          setView("login");
        }}
      >
        Logout
      </button>
    </div>
  );
}
