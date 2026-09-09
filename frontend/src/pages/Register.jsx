import { useState } from "react";
import { Link } from "react-router-dom";
import API from "../services/api";
import "./Register.css";

function Register() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleRegister = async (e) => {
    e.preventDefault();

    try {
      const response = await API.post("/auth/register", {
        username,
        email,
        password,
      });

      setMessage(
        response.data.message || "Registration successful! 🎉"
      );

      setUsername("");
      setEmail("");
      setPassword("");

      console.log("Registration response:", response.data);

    } catch (error) {
      console.error("Register error:", error);

      setMessage(
        error.response?.data?.message || "Registration failed"
      );

      console.log(
        "Backend response:",
        error.response?.data
      );
    }
  };

  return (
    <div className="register-page">
      <div className="register-card">

        <h1>InstaChat 💬</h1>

        <p className="subtitle">
          Create your account
        </p>

        <h2>Join us 👋</h2>

        <form onSubmit={handleRegister}>

          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button type="submit">
            Create Account
          </button>

        </form>

        {message && (
          <p className="register-message">
            {message}
          </p>
        )}
        <p className="login-text">
         Already have an account? <Link to="/login">Login</Link>
        </p>
       

      </div>
    </div>
  );
}

export default Register;