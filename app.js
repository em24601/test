const ClientId = '35fa6d33020c4821bc405c0c97d1fab5';
const RedirectUri = 'http://127.0.0.1:5500/';
const Scopes = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';
//
const loginButton = document.getElementById("login-btn");
const albumArt = document.getElementById("album-art");
const songTitle = document.getElementById("song-title");
const artistName = document.getElementById("artist-name");
const progressContainer = document.querySelector(".progress-container");
const progressBar = document.getElementById("progress-bar");
const prevButton = document.getElementById("prev-btn");
const playButton = document.getElementById("play-btn");
const nextButton = document.getElementById("next-btn");
//
function randomString(length){
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const values = crypto.getRandomValues(new Uint32Array(length));
    return Array.from(values, (v) => chars[v % chars.length]).join("");
}

async function sha256Base64Url(text) {
    const bytes = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return btoa(String.fromCharCode(...new Uint8Array(hash)))
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
}

async function login() {
    const verifier = randomString(64);
    localStorage.setItem("verifier", verifier);
    const challenge = await sha256Base64Url(verifier);

    const params = new URLSearchParams({
        client_id: ClientId,
        response_type: "code",
        redirect_uri: RedirectUri,
        scope: Scopes,
        code_challenge_method: "S256",
        code_challenge: challenge,
    });
    window.location = "https://accounts.spotify.com/authorize?" + params;
}
//

async function requestToken(body) {
    const res = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
            body: new URLSearchParams(body),
    });
    const data = await res.json();
    if (data.access_token) {
        localStorage.setItem("access_token", data.access_token);
        localStorage.setItem("expires_at", Date.now() + data.expires_in * 1000);
        if (data.refresh_token) localStorage.setItem("refresh_token", data.refresh_token);
    }
}
//

async function getToken() {
    const expiresAt = Number(localStorage.getItem("expires_at"));
    if (Date.now() > expiresAt - 60000) {
        const refresh = localStorage.getItem("refresh_token");
        if (!refresh) return null;
        await requestToken({
            client_id: ClientId,
            grant_type: "refresh_token",
            refresh_token: refresh,
        });
    }
    return localStorage.getItem("access_token");
}
//
async function handleRedirect() {
    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) return;
    await requestToken({
        client_id: ClientId,
        grant_type: "authorization_code",
        code: code,
        redirect_uri: RedirectUri,
        code_verifier: localStorage.getItem("verifier"),
    });
    history.replaceState({}, "", RedirectUri);
}
//

async function spotify(path, method = "GET") {
    const token = await getToken();
    if (!token) return null;
    const res=await fetch("https://api.spotify.com/v1" + path, {
        method: method,
        headers: {Authorization: "Bearer " + token},
    });
    const text = await res.text();
    return text ? JSON.parse(text): null;
}
//

let state = {isPlaying: false, progress: 0, duration: 0, syncedAt: 0};

async function sync() {
    const data = await spotify("/me/player");
    if (!data || !data.item || data.item.type !== "track") return;

    state = {
        isPlaying: data.is_playing,
        progress: data.progress_ms,
        duration: data.item.duration_ms,
        syncedAt: Date.now(),
    };
    songTitle.textContent = data.item.name;
    artistName.textContent = data.item.artists.map((a) => a.name).join(", ");
    playButton.textContent = data.is_playing ? "⏸" : "▶";
    const artUrl = data.item.album.images[0].url;
    if (albumArt.src !== artUrl) albumArt.src = artUrl;
}
//

function updateProgressBar() {
    if (!state.duration) return;
    const elapsed = state.isPlaying ? Date.now() - state.syncedAt: 0;
    const position = Math.min(state.progress + elapsed, state.duration);
    progressBar.style.width = (position / state.duration) * 100 + "%";
}
//

async function command(path, method) {
    await spotify(path, method);
    setTimeout(sync, 300);
}
loginButton.addEventListener("click", login);
playButton.addEventListener("click", () => command(state.isPlaying ? "/me/player/pause" : "/me/player/play", "PUT")
);
nextButton.addEventListener("click", () => command("/me/player/next", "POST"));
prevButton.addEventListener("click", () => command("/me/player/previous", "POST"));

progressContainer.addEventListener("click", (event) => {
    const box = progressContainer.getBoundingClientRect();
    const fraction = (event.clientX - box.left) / box.width;
    const ms = Math.floor(fraction * state.duration);
    command("/me/player/seek?position_ms=" + ms, "PUT");
});

async function init() {
    await handleRedirect();
    if (await getToken()) {
        loginButton.hidden = true;
        sync();
        setInterval(sync, 3000);
        setInterval(updateProgressBar, 500);
    }
}

init();