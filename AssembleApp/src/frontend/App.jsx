import { useEffect, useState } from "react";
import axios from "axios";
import "./App.css";


export default function App() {
  const [screen, setScreen] = useState("Home");
  const [bookmarked, setBookmarked] = useState(false);
  const API = "http://localhost:3001";
  const [user, setUser] = useState(null); // logged-in user
  const [authMode, setAuthMode] = useState("login"); // login | register
  const userId = user?.id;
  const [bookmarkedEvents, setBookmarkedEvents] = useState([]);
  const [discoveryEvents, setDiscoveryEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const isBookmarked = selectedEvent
    ? bookmarkedEvents.some((e) => e.id === selectedEvent.id)
    : false;

  //load in a user's bookmarked events
  useEffect(() => {
    if (!user) return;

    async function fetchUserEvents() {
      try {
        const res = await axios.get(`${API}/users/${user.id}/events`);
        setBookmarkedEvents(res.data);
      } catch (err) {
        console.error(err);
      }
    }

    fetchUserEvents();
  }, [user]);

  //load in the discovery events
  useEffect(() => {
    if (!user) return;
    async function fetchDiscover() {
      try {
        const res = await axios.get(
          `${API}/users/${user.id}/discover-events`
        );

        setDiscoveryEvents(res.data);
      } catch (err) {
        console.error(err);
      }
    }

    fetchDiscover();
  }, [user]);

  useEffect(() => {
    if (!user || user.role !== "admin") return;

    async function fetchUsers() {
      try {
        const res = await axios.get(`${API}/admin/users`, {
          params: { user_id: user.id }
        });

        setAllUsers(res.data);
      } catch (err) {
        console.error(err);
      }
    }

    fetchUsers();
  }, [user]);

  const showScreen = (name) => {
    setScreen(name);
  };

  const toggleBookmark = () => {
    setBookmarked(!bookmarked);
  };

  return (
    <div className="app">

      {/* HEADER */}
      <div className="header">
        <div className="header-title">{screen}</div>
      </div>

      {/* CONTENT */}
      <div className="content">

        {/* HOME */}
        {screen === "Home" && (
          <>
            {user && (<div>
              {bookmarkedEvents.map((event) => (
                <div
                  key={event.id}
                  className="event-card"
                  onClick={() => {
                    setSelectedEvent(event);
                    setScreen("Detail");
                  }}
                >
                  <div className="img-placeholder">Event Image</div>

                  <div className="event-title">{event.title}</div>

                  <div className="event-meta">
                    {event.starts_at} · {event.location}
                  </div>

                  <span className="pill">Organizer-verified</span>
                  <button
                    className="btn btn-secondary"
                    onClick={async (e) => {
                      e.stopPropagation();

                      try {
                        await axios.post(`${API}/events/${event.id}/leave`, {
                          user_id: user.id,
                        });

                        setBookmarkedEvents((prev) =>
                          prev.filter((e) => e.id !== event.id)
                        );

                        setDiscoveryEvents((prev) => [...prev, event]);

                      } catch (err) {
                        console.error(err);
                      }
                    }}
                  >
                    Remove Bookmark
                  </button>
                </div>
              ))}
            </div>
            )}

            {!user && (
              <div className="login-prompt-container">
                <div className="login-prompt">
                  You need to log in to see your bookmarked events!
                </div>
              </div>
            )}
          </>
        )}

        {/* DISCOVER */}
        {screen === "Discover" && (
          <>
          {user && (
          <div>
            <div className="filters">
              <span className="active">Today</span>
              <span>This Week</span>
              <span>Near Me</span>
              <span>Climate</span>
              <span>Labor</span>
            </div>
            {user?.role === "admin" && (
              <button
                className="btn btn-new-event"
                onClick={() => setScreen("Create Event")}
              >
                + New Event
              </button>
            )}
            {discoveryEvents.map((event) => (
              <div
                key={event.id}
                className="event-card"
                onClick={() => {
                  setSelectedEvent(event);
                  setScreen("Detail");
                }}
              >
                <div className="img-placeholder">Event Image</div>

                <div className="event-title">{event.title}</div>

                <div className="event-meta">
                  {event.starts_at} · {event.location}
                </div>



                {user && (<button
                  className="btn btn-bookmark"
                  onClick={async (e) => {
                    e.stopPropagation();

                    try {
                      await axios.post(`${API}/events/${event.id}/join`, {
                        user_id: user.id,
                      });

                      setDiscoveryEvents((prev) =>
                        prev.filter((e) => e.id !== event.id)
                      );

                      setBookmarkedEvents((prev) => [...prev, event]);

                    } catch (err) {
                      console.error(err);
                      alert("Failed to bookmark");
                    }
                  }}
                >
                  Bookmark
                </button>
                )}
              </div>
            ))}
          </div>
          )}

          {!user && (
              <div className="login-prompt-container">
                <div className="login-prompt">
                  You need to log in to see nearby events!
                </div>
              </div>
            )}
          </>
        )}

        {screen === "Create Event" && (
          <div className="formContainer">
            <h3>Create Event</h3>

            <div className="formGroup">
              <input className="inputField" id="title" placeholder="Title" />
              <textarea
                className="inputField textareaField"
                id="description"
                placeholder="Description"
              />
              <input className="inputField" id="location" placeholder="Location" />

              <input className="inputField" id="start" type="datetime-local" />
              <input className="inputField" id="end" type="datetime-local" />

              <select className="inputField" id="status">
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <button
              className="btn btn-primary fullWidth"
              onClick={async () => {
                const eventData = {
                  creator_id: user.id,
                  title: document.getElementById("title").value,
                  description: document.getElementById("description").value,
                  location: document.getElementById("location").value,
                  starts_at: document.getElementById("start").value,
                  ends_at: document.getElementById("end").value,
                  status: document.getElementById("status").value,
                };

                try {
                  await axios.post(`${API}/events`, eventData);
                  alert("Event created!");
                  setScreen("Discover");
                } catch (err) {
                  console.error(err);
                  alert("Failed to create event");
                }
              }}
            >
              Create Event
            </button>
          </div>
        )}

        {/* DETAIL */}
        {screen === "Detail" && selectedEvent && (
          <div>
            <div className="img-placeholder">Event Banner</div>

            <h3>{selectedEvent.title}</h3>

            <p>
              <strong>Date:</strong>{" "}
              {new Date(selectedEvent.starts_at).toLocaleString()}
            </p>

            <p>
              <strong>Location:</strong> {selectedEvent.location}
            </p>

            <p>
              <strong>Organizer:</strong>{" "}
              {selectedEvent.creator_username || "Unknown"}{" "}
              <span className="pill">Verified</span>
            </p>

            {user && (<button
              className={`btn ${isBookmarked ? "btn-secondary" : "btn-bookmark"}`}
              onClick={async () => {
                try {
                  if (isBookmarked) {

                    await axios.post(`${API}/events/${selectedEvent.id}/leave`, {
                      user_id: user.id,
                    });

                    setBookmarkedEvents((prev) =>
                      prev.filter((e) => e.id !== selectedEvent.id)
                    );

                    setDiscoveryEvents((prev) => [...prev, selectedEvent]);

                  } else {

                    await axios.post(`${API}/events/${selectedEvent.id}/join`, {
                      user_id: user.id,
                    });

                    setDiscoveryEvents((prev) =>
                      prev.filter((e) => e.id !== selectedEvent.id)
                    );

                    setBookmarkedEvents((prev) => [...prev, selectedEvent]);
                  }
                } catch (err) {
                  console.error(err);
                  alert("Action failed");
                }
              }}
            >
              {isBookmarked ? "Remove Bookmark" : "Bookmark"}
            </button>
            )}

            {user?.role === "admin" && selectedEvent && (
              <button
                className="btn btn-delete"
                onClick={async () => {
                  try {
                    await axios.delete(`${API}/events/${selectedEvent.id}`, {
                      data: { user_id: user.id }, // axios needs this format for DELETE body
                    });

                    alert("Event deleted");

                    // remove from UI
                    setBookmarkedEvents((prev) =>
                      prev.filter((e) => e.id !== selectedEvent.id)
                    );

                    setDiscoveryEvents((prev) =>
                      prev.filter((e) => e.id !== selectedEvent.id)
                    );

                    setScreen("Discover");
                  } catch (err) {
                    console.error(err);
                    alert("Failed to delete event");
                  }
                }}
              >
                Delete Event
              </button>
            )}
          </div>
        )}

        {/* PROFILE */}
        {screen === "Profile" && (
          <div>
            {!user ? (
              <div>

                {authMode === "login" ? (
                  <>
                    <div className="auth-container">
                      <h3 className="auth-title">Login</h3>

                      <div className="loginForm">
                        <input
                          className="inputField"
                          id="loginEmail"
                          placeholder="Email"
                        />

                        <input
                          className="inputField"
                          id="loginPassword"
                          placeholder="Password"
                          type="password"
                        />
                      </div>

                      <button
                        className="btn btn-primary auth-button"
                        onClick={async () => {
                          const email = document.getElementById("loginEmail").value;
                          const password = document.getElementById("loginPassword").value;

                          try {
                            const res = await axios.post(`${API}/login`, {
                              email,
                              password,
                            });

                            setUser(res.data);
                          } catch (err) {
                            alert(err.response?.data?.error || "Login failed");
                          }
                        }}
                      >
                        Login
                      </button>

                      <button
                        className="auth-switch"
                        onClick={() => setAuthMode("register")}
                      >
                        Create an account
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="auth-container">
                      <h3 className="auth-title">Create Account</h3>

                      <div className="loginForm">
                        <input className="inputField" id="regUsername" placeholder="Username" />
                        <input className="inputField" id="regEmail" placeholder="Email" />
                        <input className="inputField" id="regPassword" type="password" placeholder="Password" />

                        <select className="inputField" id="regRole">
                          <option value="member">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>

                      <button
                        className="btn btn-primary auth-button"
                        onClick={async () => {
                          const username = document.getElementById("regUsername").value;
                          const email = document.getElementById("regEmail").value;
                          const password = document.getElementById("regPassword").value;
                          const role = document.getElementById("regRole").value;

                          try {
                            await axios.post(`${API}/users`, {
                              username,
                              email,
                              password_hash: password,
                              role,
                            });

                            alert("Account created! Now log in.");
                            setAuthMode("login");
                          } catch (err) {
                            alert("Signup failed");
                          }
                        }}
                      >
                        Sign Up
                      </button>

                      <button
                        className="auth-switch"
                        onClick={() => setAuthMode("login")}
                      >
                        Back to login
                      </button>
                    </div>
                  </>
                )}

              </div>
            ) : (
              <div>
                <h3>Your Profile</h3>

                <p>Logged in as: {user.username}</p>
                <p>You are a: {user.role}</p>

                <button
                  className="btn btn-secondary"
                  onClick={() => setUser(null)}
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      {/* NAVIGATION */}
      <div className="tabs">
        {["Home", "Discover", "Profile"].map((tab) => (
          <div
            key={tab}
            className={`tab ${screen === tab ? "active" : ""}`}
            onClick={() => setScreen(tab)}
          >
            {tab}
          </div>
        ))}
      </div>

    </div>
  );
}