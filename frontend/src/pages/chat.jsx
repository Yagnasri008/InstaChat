import { useEffect, useRef, useState } from "react";
import API from "../services/api";
import socket from "../services/socket";
import "./chat.css";

console.log("🚨 CHAT JSX RUNNING 🚨");

function Chat() {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedConversation, setSelectedConversation] =
    useState(null);

  const [messages, setMessages] = useState([]);
  const [messageLoading, setMessageLoading] = useState(false);
  const [newMessage, setNewMessage] = useState("");

  // Typing indicator
  const [otherUserTyping, setOtherUserTyping] =
    useState(false);

  // Online status
  const [otherUserOnline, setOtherUserOnline] =
    useState(false);

  // Call states
  const [incomingCall, setIncomingCall] = useState(null);
  const [callStatus, setCallStatus] = useState("");
  const [inCall, setInCall] = useState(false);

  // WebRTC refs
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const currentCallUserIdRef = useRef(null);
  const pendingIceCandidatesRef = useRef([]);

  // Typing timer
  const typingTimeoutRef = useRef(null);

  // =========================
  // GET CURRENT USER ID
  // =========================

  const getCurrentUserId = () => {
    const token = localStorage.getItem("token");

    if (!token) {
      return null;
    }

    try {
      const payload = token.split(".")[1];

      const decodedPayload = JSON.parse(
        atob(
          payload
            .replace(/-/g, "+")
            .replace(/_/g, "/")
        )
      );

      return decodedPayload.userId;
    } catch (error) {
      console.error(
        "Could not decode token:",
        error
      );

      return null;
    }
  };

  const currentUserId = getCurrentUserId();

  // =========================
  // GET CURRENT OTHER USER
  // =========================

  const getOtherUser = () => {
    if (!selectedConversation) {
      return null;
    }

    return selectedConversation.participants.find(
      (participant) =>
        String(participant._id) !==
        String(currentUserId)
    );
  };

  // =========================
  // WEBRTC
  // =========================

  const createPeerConnection = (targetUserId) => {
    console.log("🔗 Creating RTCPeerConnection");

    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    peerConnectionRef.current = peerConnection;
    currentCallUserIdRef.current = targetUserId;

    peerConnection.onicecandidate = (event) => {
      if (!event.candidate) return;
      console.log("🧊 Sending ICE candidate");
      socket.emit("iceCandidate", { targetUserId, candidate: event.candidate });
    };

    peerConnection.ontrack = (event) => {
      console.log("📺 Remote stream received");
      remoteStreamRef.current = event.streams[0];
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
        remoteVideoRef.current.play().catch(() => {});
      }
    };

    peerConnection.onconnectionstatechange = () => {
      console.log("🔗 WebRTC connection state:", peerConnection.connectionState);
      if (peerConnection.connectionState === "connected") setCallStatus("Connected 📞");
      if (["disconnected", "failed", "closed"].includes(peerConnection.connectionState)) cleanupCall();
    };

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStreamRef.current);
      });
    }

    return peerConnection;
  };

  const getLocalMedia = async () => {
    console.log("🎥 Requesting camera + microphone...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      console.log("🎥 Camera + microphone ready");
      return stream;
    } catch (error) {
      console.error("❌ Camera/microphone error:", error);
      setCallStatus("Camera or microphone permission denied ❌");
      return null;
    }
  };

  const flushPendingIceCandidates = async () => {
    const peerConnection = peerConnectionRef.current;
    if (!peerConnection) return;
    const candidates = pendingIceCandidatesRef.current;
    pendingIceCandidatesRef.current = [];
    for (const candidate of candidates) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error("❌ Failed to add queued ICE candidate:", error);
      }
    }
  };

  const cleanupCall = () => {
    console.log("🧹 Cleaning up call...");
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    remoteStreamRef.current = null;
    currentCallUserIdRef.current = null;
    pendingIceCandidatesRef.current = [];
    setIncomingCall(null);
    setInCall(false);
    setCallStatus("");
  };

  // The video elements are rendered only after inCall becomes true,
  // so attach the streams after React renders them.
  useEffect(() => {
    if (!inCall) return;
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
      localVideoRef.current.play().catch(() => {});
    }
    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
      remoteVideoRef.current.play().catch(() => {});
    }
  }, [inCall]);

  // =========================
  // SOCKET CONNECTION
  // =========================

  useEffect(() => {
    console.log(
      "🔌 Starting Socket.IO connection..."
    );

    socket.connect();

    const handleConnect = () => {
      console.log(
        "✅ SOCKET CONNECTED:",
        socket.id
      );

      if (currentUserId) {
        socket.emit(
          "userOnline",
          currentUserId
        );

        console.log(
          "🟢 Sent userOnline:",
          currentUserId
        );
      }

      if (selectedConversation) {
        socket.emit(
          "joinConversation",
          selectedConversation._id
        );

        console.log(
          "🏠 Rejoined conversation:",
          selectedConversation._id
        );
      }
    };

    const handleDisconnect = (reason) => {
      console.log(
        "🔌 SOCKET DISCONNECTED:",
        reason
      );
    };

    const handleReconnectAttempt = (attempt) => {
      console.log(
        `🔄 RECONNECT ATTEMPT: ${attempt}`
      );
    };

    const handleConnectError = (error) => {
      console.error(
        "❌ SOCKET CONNECTION ERROR:",
        error.message
      );
    };

    socket.on(
      "connect",
      handleConnect
    );

    socket.on(
      "disconnect",
      handleDisconnect
    );

    socket.io.on(
      "reconnect_attempt",
      handleReconnectAttempt
    );

    socket.on(
      "connect_error",
      handleConnectError
    );

    return () => {
      socket.off(
        "connect",
        handleConnect
      );

      socket.off(
        "disconnect",
        handleDisconnect
      );

      socket.io.off(
        "reconnect_attempt",
        handleReconnectAttempt
      );

      socket.off(
        "connect_error",
        handleConnectError
      );

      socket.disconnect();
    };
  }, [currentUserId]);

  // =========================
  // REJOIN ROOM
  // =========================

  useEffect(() => {
    if (!selectedConversation) {
      return;
    }

    if (!socket.connected) {
      return;
    }

    socket.emit(
      "joinConversation",
      selectedConversation._id
    );

    console.log(
      "🏠 Joined conversation:",
      selectedConversation._id
    );
  }, [selectedConversation]);

  // =========================
  // GET CONVERSATIONS
  // =========================

  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const token =
          localStorage.getItem("token");

        const response = await API.get(
          "/conversations",
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        console.log(
          "CONVERSATIONS:",
          response.data.conversations
        );

        setConversations(
          response.data.conversations
        );
      } catch (error) {
        console.error(
          "Get conversations error:",
          error
        );
      } finally {
        setLoading(false);
      }
    };

    fetchConversations();
  }, []);

  // =========================
  // GET MESSAGES
  // =========================

  useEffect(() => {
    if (!selectedConversation) {
      return;
    }

    const fetchMessages = async () => {
      try {
        setMessageLoading(true);

        const token =
          localStorage.getItem("token");

        const response = await API.get(
          `/messages/${selectedConversation._id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        console.log(
          "MESSAGES:",
          response.data.messages
        );

        setMessages(
          response.data.messages
        );
      } catch (error) {
        console.error(
          "Get messages error:",
          error
        );
      } finally {
        setMessageLoading(false);
      }
    };

    fetchMessages();
  }, [selectedConversation]);

  // =========================
  // ONLINE STATUS
  // =========================

  useEffect(() => {
    if (!selectedConversation) {
      setOtherUserOnline(false);
      return;
    }

    const otherUser = getOtherUser();

    if (!otherUser) {
      setOtherUserOnline(false);
      return;
    }

    const checkOnlineStatus = async () => {
      try {
        const token =
          localStorage.getItem("token");

        const response = await API.get(
          `/users/${otherUser._id}/online`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        setOtherUserOnline(
          response.data.online
        );
      } catch (error) {
        console.error(
          "Online status error:",
          error
        );

        setOtherUserOnline(false);
      }
    };

    checkOnlineStatus();

    const interval = setInterval(
      checkOnlineStatus,
      3000
    );

    return () => {
      clearInterval(interval);
    };
  }, [
    selectedConversation,
    currentUserId,
  ]);

  // =========================
  // RECEIVE REAL-TIME MESSAGE
  // =========================

  useEffect(() => {
    const handleNewMessage = (message) => {
      console.log(
        "📨 NEW REAL-TIME MESSAGE:",
        message
      );

      if (
        String(message.conversationId) ===
        String(
          selectedConversation?._id
        )
      ) {
        setMessages(
          (previousMessages) => [
            ...previousMessages,
            message,
          ]
        );
      }
    };

    socket.on(
      "newMessage",
      handleNewMessage
    );

    return () => {
      socket.off(
        "newMessage",
        handleNewMessage
      );
    };
  }, [selectedConversation]);

  // =========================
  // RECEIVE TYPING EVENTS
  // =========================

  useEffect(() => {
    const handleUserTyping = ({
      userId,
      conversationId,
    }) => {
      if (
        String(userId) ===
        String(currentUserId)
      ) {
        return;
      }

      if (
        String(conversationId) !==
        String(
          selectedConversation?._id
        )
      ) {
        return;
      }

      setOtherUserTyping(true);
    };

    const handleUserStoppedTyping = ({
      userId,
      conversationId,
    }) => {
      if (
        String(userId) ===
        String(currentUserId)
      ) {
        return;
      }

      if (
        String(conversationId) !==
        String(
          selectedConversation?._id
        )
      ) {
        return;
      }

      setOtherUserTyping(false);
    };

    socket.on(
      "userTyping",
      handleUserTyping
    );

    socket.on(
      "userStoppedTyping",
      handleUserStoppedTyping
    );

    return () => {
      socket.off(
        "userTyping",
        handleUserTyping
      );

      socket.off(
        "userStoppedTyping",
        handleUserStoppedTyping
      );
    };
  }, [
    currentUserId,
    selectedConversation,
  ]);

  // =========================
  // RECEIVE INCOMING CALL
  // =========================

  useEffect(() => {
    const handleIncomingCall = ({
      callerId,
      callerName,
      receiverId,
      conversationId,
      offer
    }) => {
      console.log(
        "📞 INCOMING CALL:",
        {
          callerId,
          callerName,
          conversationId,
        }
      );

      setIncomingCall({
        callerId,
        callerName,
        receiverId,
        conversationId,
        offer
      });

      setCallStatus(
        `${callerName} is calling...`
      );
    };

    socket.on(
      "incomingCall",
      handleIncomingCall
    );

    return () => {
      socket.off(
        "incomingCall",
        handleIncomingCall
      );
    };
  }, []);

  // =========================
  // START CALL
  // =========================

  const handleStartCall = async () => {
    if (!selectedConversation) return;
    const otherUser = getOtherUser();
    if (!otherUser) return;

    console.log("📞 STARTING WEBRTC CALL:", otherUser.username);
    setCallStatus(`Calling ${otherUser.username}...`);

    const stream = await getLocalMedia();
    if (!stream) return;

    const peerConnection = createPeerConnection(otherUser._id);

    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      console.log("📤 Sending WebRTC offer");
      socket.emit("callUser", {
        callerId: currentUserId,
        callerName: "Yagna",
        receiverId: otherUser._id,
        conversationId: selectedConversation._id,
        offer
      });
      setInCall(true);
    } catch (error) {
      console.error("❌ Failed to create offer:", error);
      cleanupCall();
    }
  };

  // =========================
  // ACCEPT CALL
  // =========================

  const handleAcceptCall = async () => {
    if (!incomingCall) return;

    console.log("✅ ACCEPTING WEBRTC CALL");

    const stream = await getLocalMedia();
    if (!stream) return;

    const peerConnection = createPeerConnection(incomingCall.callerId);

    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
      await flushPendingIceCandidates();
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      socket.emit("acceptCall", {
        callerId: incomingCall.callerId,
        receiverId: currentUserId,
        conversationId: incomingCall.conversationId,
        answer
      });

      setIncomingCall(null);
      setInCall(true);
      setCallStatus("Connecting... 📞");
    } catch (error) {
      console.error("❌ Failed to accept call:", error);
      cleanupCall();
    }
  };

  // =========================
  // REJECT CALL
  // =========================

  const handleRejectCall = () => {
    if (!incomingCall) return;
    console.log("❌ REJECTING CALL:", incomingCall.callerId);
    socket.emit("rejectCall", {
      callerId: incomingCall.callerId,
      receiverId: currentUserId,
      conversationId: incomingCall.conversationId
    });
    setIncomingCall(null);
    setCallStatus("");
  };

  // =========================
  // CALL ACCEPTED / REJECTED
  // =========================

  useEffect(() => {
    const handleCallAccepted = async ({ answer }) => {
      console.log("✅ CALL ACCEPTED");
      const peerConnection = peerConnectionRef.current;
      if (!peerConnection) return;
      try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        await flushPendingIceCandidates();
        setCallStatus("Connecting... 📞");
      } catch (error) {
        console.error("❌ Failed to set remote answer:", error);
      }
    };

    const handleCallRejected = () => {
      console.log("❌ CALL REJECTED");
      cleanupCall();
      setCallStatus("Call rejected ❌");
      setTimeout(() => setCallStatus(""), 2000);
    };

    socket.on("callAccepted", handleCallAccepted);
    socket.on("callRejected", handleCallRejected);
    return () => {
      socket.off("callAccepted", handleCallAccepted);
      socket.off("callRejected", handleCallRejected);
    };
  }, []);

  // =========================
  // ICE CANDIDATE
  // =========================

  useEffect(() => {
    const handleIceCandidate = async ({ candidate }) => {
      if (!candidate) return;
      const peerConnection = peerConnectionRef.current;
      if (!peerConnection || !peerConnection.remoteDescription) {
        console.log("🧊 Queueing ICE candidate");
        pendingIceCandidatesRef.current.push(candidate);
        return;
      }
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        console.log("🧊 ICE candidate added");
      } catch (error) {
        console.error("❌ Failed to add ICE candidate:", error);
      }
    };
    socket.on("iceCandidate", handleIceCandidate);
    return () => socket.off("iceCandidate", handleIceCandidate);
  }, []);

  // =========================
  // CALL ENDED / OFFLINE
  // =========================

  useEffect(() => {
    const handleCallEnded = () => {
      console.log("📴 OTHER USER ENDED CALL");
      cleanupCall();
      setCallStatus("Call ended");
      setTimeout(() => setCallStatus(""), 1500);
    };
    const handleCallUserOffline = () => {
      console.log("❌ USER OFFLINE");
      cleanupCall();
      setCallStatus("User is offline ❌");
      setTimeout(() => setCallStatus(""), 2000);
    };
    socket.on("callEnded", handleCallEnded);
    socket.on("callUserOffline", handleCallUserOffline);
    return () => {
      socket.off("callEnded", handleCallEnded);
      socket.off("callUserOffline", handleCallUserOffline);
    };
  }, []);

  const handleEndCall = () => {
    const targetUserId = currentCallUserIdRef.current;
    if (targetUserId) socket.emit("endCall", { targetUserId });
    cleanupCall();
  };

  // =========================
  // CLICK CONVERSATION
  // =========================

  const handleConversationClick = (
    conversation
  ) => {
    if (typingTimeoutRef.current) {
      clearTimeout(
        typingTimeoutRef.current
      );
    }

    if (inCall) {
      return;
    }

    setSelectedConversation(
      conversation
    );

    setMessages([]);

    setOtherUserTyping(false);

    setIncomingCall(null);

    setCallStatus("");

    if (socket.connected) {
      socket.emit(
        "joinConversation",
        conversation._id
      );

      console.log(
        "🏠 JOINING ROOM:",
        conversation._id
      );
    }
  };

  // =========================
  // HANDLE TYPING
  // =========================

  const handleMessageChange = (
    event
  ) => {
    const value = event.target.value;

    setNewMessage(value);

    if (!selectedConversation) {
      return;
    }

    if (
      value.trim().length === 0
    ) {
      socket.emit(
        "stopTyping",
        {
          conversationId:
            selectedConversation._id,
          userId: currentUserId,
        }
      );

      if (typingTimeoutRef.current) {
        clearTimeout(
          typingTimeoutRef.current
        );
      }

      return;
    }

    socket.emit(
      "typing",
      {
        conversationId:
          selectedConversation._id,
        userId: currentUserId,
      }
    );

    if (typingTimeoutRef.current) {
      clearTimeout(
        typingTimeoutRef.current
      );
    }

    typingTimeoutRef.current =
      setTimeout(() => {
        socket.emit(
          "stopTyping",
          {
            conversationId:
              selectedConversation._id,
            userId: currentUserId,
          }
        );
      }, 1000);
  };

  // =========================
  // SEND MESSAGE
  // =========================

  const handleSendMessage = async () => {
    if (!newMessage.trim()) {
      return;
    }

    if (!selectedConversation) {
      return;
    }

    try {
      const token =
        localStorage.getItem("token");

      const response = await API.post(
        "/messages",
        {
          conversationId:
            selectedConversation._id,
          content: newMessage,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setMessages(
        (previousMessages) => [
          ...previousMessages,
          response.data.message,
        ]
      );

      socket.emit(
        "sendMessage",
        {
          conversationId:
            selectedConversation._id,
          message:
            response.data.message,
        }
      );

      socket.emit(
        "stopTyping",
        {
          conversationId:
            selectedConversation._id,
          userId: currentUserId,
        }
      );

      if (typingTimeoutRef.current) {
        clearTimeout(
          typingTimeoutRef.current
        );
      }

      setNewMessage("");
    } catch (error) {
      console.error(
        "Send message error:",
        error
      );
    }
  };

  // =========================
  // ENTER TO SEND
  // =========================

  const handleKeyDown = (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();

      handleSendMessage();
    }
  };

  // =========================
  // CLEANUP
  // =========================

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // =========================
  // UI
  // =========================

  const otherUser = getOtherUser();

  return (
    <div className="chat-page">

      <header className="chat-header">
        <h1>
          InstaChat 💬
        </h1>
      </header>

      <div className="chat-layout">

        {/* SIDEBAR */}

        <aside className="sidebar">

          <h2>
            Conversations
          </h2>

          {loading ? (
            <p>
              Loading...
            </p>
          ) : conversations.length ===
            0 ? (
            <p>
              No conversations yet.
            </p>
          ) : (
            conversations.map(
              (conversation) => {

                const conversationUser =
                  conversation.participants.find(
                    (participant) =>
                      String(
                        participant._id
                      ) !==
                      String(
                        currentUserId
                      )
                  );

                return (
                  <button
                    key={
                      conversation._id
                    }
                    type="button"
                    className="conversation"
                    onClick={() =>
                      handleConversationClick(
                        conversation
                      )
                    }
                  >

                    <div className="avatar">
                      {conversationUser
                        ?.username?.[0]
                        ?.toUpperCase() ||
                        "?"}
                    </div>

                    <div>

                      <h3>
                        {conversationUser
                          ?.username ||
                          "Unknown user"}
                      </h3>

                      <p>
                        Conversation
                      </p>

                    </div>

                  </button>
                );
              }
            )
          )}

        </aside>

        {/* CHAT WINDOW */}

        <main className="chat-window">

          {!selectedConversation ? (

            <div className="empty-chat">

              <h2>
                Select a conversation
              </h2>

              <p>
                Choose someone from the
                sidebar to start chatting.
              </p>

            </div>

          ) : (

            <div className="message-area">

              {/* HEADER */}

              <div className="message-header">

                <h2>
                  {otherUser?.username}
                </h2>

                <p
                  className={
                    otherUserOnline
                      ? "online-status online"
                      : "online-status offline"
                  }
                >
                  {otherUserOnline
                    ? "🟢 Online"
                    : "⚫ Offline"}
                </p>

                {/* CALL BUTTON */}

                <button
                  type="button"
                  className="call-button"
                  onClick={
                    handleStartCall
                  }
                  disabled={
                    !otherUserOnline ||
                    inCall
                  }
                >
                  📞 Call
                </button>

                {callStatus && (
                  <p className="call-status">
                    {callStatus}
                  </p>
                )}

              </div>

              {/* MESSAGES */}

              <div className="messages">

                {messageLoading ? (

                  <p>
                    Loading messages...
                  </p>

                ) : messages.length ===
                  0 ? (

                  <div className="no-messages">

                    <p>
                      No messages yet.
                    </p>

                    <p>
                      Start the conversation!
                      👋
                    </p>

                  </div>

                ) : (

                  messages.map(
                    (message) => (

                      <div
                        key={
                          message._id
                        }
                        className={
                          String(
                            message.sender?._id
                          ) ===
                          String(
                            currentUserId
                          )
                            ? "message sent"
                            : "message received"
                        }
                      >

                        <p>
                          {message.content}
                        </p>

                      </div>

                    )
                  )

                )}

              </div>

              {/* TYPING */}

              {otherUserTyping && (
                <div className="typing-indicator">
                  Typing...
                </div>
              )}

              {/* INPUT */}

              <div className="message-input">

                <input
                  type="text"
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={
                    handleMessageChange
                  }
                  onKeyDown={
                    handleKeyDown
                  }
                />

                <button
                  type="button"
                  onClick={
                    handleSendMessage
                  }
                >
                  Send
                </button>

              </div>

            </div>

          )}

        </main>

      </div>

      {/* =========================
          INCOMING CALL POPUP
      ========================= */}

      {incomingCall && (

        <div className="incoming-call-overlay">

          <div className="incoming-call-card">

            <h2>
              📞 Incoming Call
            </h2>

            <p>
              {incomingCall.callerName}
              {" "}
              is calling you...
            </p>

            <div className="incoming-call-buttons">

              <button
                type="button"
                onClick={
                  handleAcceptCall
                }
              >
                ✅ Accept
              </button>

              <button
                type="button"
                onClick={
                  handleRejectCall
                }
              >
                ❌ Reject
              </button>

            </div>

          </div>

        </div>

      )}

      {inCall && (
        <div className="video-call-overlay">
          <div className="video-call-container">
            <div className="video-call-header">
              <div>
                <strong>{otherUser?.username}</strong>
                <span>{callStatus || "Connecting..."}</span>
              </div>
              <button
                type="button"
                className="end-call-button"
                onClick={handleEndCall}
              >
                ☎️ End
              </button>
            </div>
            <div className="video-area">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="remote-video"
              />
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="local-video"
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default Chat;