const socket = io();

const MAX_NAME_LENGTH = 20;

// Schermate
const menuContainer = document.getElementById('menu-container');
const homeScreen = document.getElementById('home-screen');
const joinScreen = document.getElementById('join-screen');
const playerConfigScreen = document.getElementById('player-config-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const hostGameScreen = document.getElementById('host-game-screen');
const playerGameScreen = document.getElementById('player-game-screen');

// Controlli Menu
const inputHostName = document.getElementById('input-host-name');
const homeError = document.getElementById('home-error');
const btnCreate = document.getElementById('btn-create');
const btnJoin = document.getElementById('btn-join');
const btnVerifyPin = document.getElementById('btn-verify-pin');
const btnBackHome = document.getElementById('btn-back-home');
const btnBackJoin = document.getElementById('btn-back-join');
const btnJoinRoom = document.getElementById('btn-join-room');
const btnStartGame = document.getElementById('btn-start-game');

const inputPin = document.getElementById('input-pin');
const inputName = document.getElementById('input-name');
const inputCards = document.getElementById('input-cards');
const joinError = document.getElementById('join-error');

const displayPin = document.getElementById('display-pin');
const hostControls = document.getElementById('host-controls');
const playerWaiting = document.getElementById('player-waiting');
const playersList = document.getElementById('players-list');
const playerCount = document.getElementById('player-count');

// Controlli Gioco Host
const btnExtract = document.getElementById('btn-extract');
const hostExtractedCounter = document.getElementById('host-extracted-counter');
const hostLastSixContainer = document.getElementById('host-last-six-container');
const hostBoardGrid = document.getElementById('host-board-grid');

// Controlli Gioco Giocatore
const playerExtractedCounter = document.getElementById('player-extracted-counter');
const playerLastSixContainer = document.getElementById('player-last-six-container');
const playerCardsGrid = document.getElementById('player-cards-grid');

// Modali e Banner
const winBanner = document.getElementById('win-banner');
const prizesModal = document.getElementById('prizes-modal');
const prizesTableBody = document.getElementById('prizes-table-body');
const btnOpenPrizesHost = document.getElementById('btn-open-prizes-host');
const btnOpenPrizesPlayer = document.getElementById('btn-open-prizes-player');
const btnCloseModal = document.getElementById('btn-close-modal');

const gameoverModal = document.getElementById('gameover-modal');
const gameoverTableBody = document.getElementById('gameover-table-body');
const btnExitHome = document.getElementById('btn-exit-home');

let currentPin = '';
let isHost = false;
let currentHostName = '';
let currentPlayerToken = '';
let isLeavingManually = false;

function showMenuScreen(screen) {
    menuContainer.classList.remove('hidden');
    hostGameScreen.classList.add('hidden');
    playerGameScreen.classList.add('hidden');
    [homeScreen, joinScreen, playerConfigScreen, lobbyScreen].forEach(s => s.classList.add('hidden'));
    screen.classList.remove('hidden');
}

function updateUrl(pin, role = '') {
    const newUrl = `${window.location.pathname}?pin=${pin}${role ? '&role=' + role : ''}`;
    window.history.pushState({ pin }, '', newUrl);
}

function clearSession() {
    isLeavingManually = true;
    if (currentPin) {
        sessionStorage.removeItem(`tombola_player_${currentPin}`);
        sessionStorage.removeItem(`tombola_host_${currentPin}`);
    }
    currentPin = '';
    isHost = false;
    currentPlayerToken = '';
    window.history.pushState({}, '', window.location.pathname);
}

function renderTopBar(extractedNumbers) {
    const total = extractedNumbers.length;
    const lastSix = extractedNumbers.slice(-6).reverse();

    if (isHost) {
        hostExtractedCounter.textContent = `${total} / 90`;
        hostLastSixContainer.innerHTML = '';
        lastSix.forEach((n, idx) => {
            const pill = document.createElement('div');
            pill.className = idx === 0 ? 'num-pill latest' : 'num-pill';
            pill.textContent = n;
            hostLastSixContainer.appendChild(pill);
        });
    } else {
        playerExtractedCounter.textContent = `${total} / 90`;
        playerLastSixContainer.innerHTML = '';
        lastSix.forEach((n, idx) => {
            const pill = document.createElement('div');
            pill.className = idx === 0 ? 'num-pill latest' : 'num-pill';
            pill.textContent = n;
            playerLastSixContainer.appendChild(pill);
        });
    }
}

function renderPrizesTable(tbody, allPrizes) {
    const order = ['ambo', 'terna', 'quaterna', 'cinquina', 'tombola'];
    tbody.innerHTML = '';
    order.forEach(key => {
        const info = allPrizes && allPrizes[key];
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${key.toUpperCase()}</strong></td>
            <td>${info ? info.winner : '-'}</td>
            <td>${info ? info.atExtraction + '° estr.' : '-'}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderHostBoard(hostBoards, extractedNumbers = []) {
    menuContainer.classList.add('hidden');
    playerGameScreen.classList.add('hidden');
    hostGameScreen.classList.remove('hidden');

    hostBoardGrid.innerHTML = '';
    const extractedSet = new Set(extractedNumbers);

    hostBoards.forEach(quadrant => {
        const qDiv = document.createElement('div');
        qDiv.className = 'quadrant';
        quadrant.forEach(row => {
            row.forEach(num => {
                const cell = document.createElement('div');
                cell.className = 'board-cell';
                if (extractedSet.has(num)) cell.classList.add('extracted');
                cell.dataset.num = num;
                cell.textContent = num;
                qDiv.appendChild(cell);
            });
        });
        hostBoardGrid.appendChild(qDiv);
    });

    renderTopBar(extractedNumbers);
}

function renderPlayerCards(cards, markedNumbers = [], extractedNumbers = [], currentNumber = null) {
    menuContainer.classList.add('hidden');
    hostGameScreen.classList.add('hidden');
    playerGameScreen.classList.remove('hidden');

    playerCardsGrid.innerHTML = '';
    const markedSet = new Set(markedNumbers);
    const extractedSet = new Set(extractedNumbers);

    cards.forEach(card => {
        const cardDiv = document.createElement('div');
        cardDiv.className = 'player-card';
        card.forEach(row => {
            row.forEach(num => {
                const cell = document.createElement('div');
                if (num === null) {
                    cell.className = 'card-cell empty';
                } else {
                    cell.className = 'card-cell number';
                    cell.dataset.num = num;
                    cell.textContent = num;

                    if (markedSet.has(num)) {
                        cell.classList.add('marked');
                    } else if (num === currentNumber) {
                        cell.classList.add('flash');
                    } else if (extractedSet.has(num)) {
                        cell.classList.add('can-mark');
                    }

                    cell.addEventListener('click', () => {
                        if (gameoverModal && !gameoverModal.classList.contains('hidden')) return;
                        if (cell.classList.contains('flash') || cell.classList.contains('can-mark')) {
                            if (!cell.classList.contains('marked')) {
                                cell.classList.remove('flash', 'can-mark');
                                cell.classList.add('marked');
                                socket.emit('markNumber', { pin: currentPin, number: num });
                            }
                        }
                    });
                }
                cardDiv.appendChild(cell);
            });
        });
        playerCardsGrid.appendChild(cardDiv);
    });

    renderTopBar(extractedNumbers);
}

// --- RICONNESSIONE AL CARICAMENTO ---
window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const pinParam = urlParams.get('pin');
    const roleParam = urlParams.get('role');

    if (pinParam) {
        currentPin = pinParam;
        if (roleParam === 'host') {
            isHost = true;
            currentHostName = sessionStorage.getItem(`tombola_host_${pinParam}`) || '';
            socket.emit('reconnectHost', { pin: currentPin, hostName: currentHostName });
        } else {
            const savedToken = sessionStorage.getItem(`tombola_player_${pinParam}`);
            if (savedToken) {
                currentPlayerToken = savedToken;
                socket.emit('reconnectPlayer', { pin: currentPin, playerToken: savedToken });
            } else {
                inputPin.value = currentPin;
                showMenuScreen(playerConfigScreen);
            }
        }
    }
});

socket.on('reconnectPlayerFailed', () => {
    inputPin.value = currentPin;
    showMenuScreen(playerConfigScreen);
});

// --- FLUSSO HOME & LOBBY ---
btnCreate.addEventListener('click', () => {
    const hostName = inputHostName.value.trim().slice(0, MAX_NAME_LENGTH);
    if (!hostName) {
        homeError.textContent = 'Inserisci il tuo nome prima di creare la stanza.';
        return;
    }
    homeError.textContent = '';
    isHost = true;
    currentHostName = hostName;
    socket.emit('createRoom', { hostName });
});

socket.on('createRoomError', (msg) => {
    homeError.textContent = msg;
});

socket.on('roomCreated', ({ pin, hostName }) => {
    currentPin = pin;
    isHost = true;
    if (hostName) currentHostName = hostName;
    sessionStorage.setItem(`tombola_host_${pin}`, currentHostName);
    updateUrl(pin, 'host');
    displayPin.textContent = pin;
    hostControls.classList.remove('hidden');
    playerWaiting.classList.add('hidden');
    showMenuScreen(lobbyScreen);
});

btnJoin.addEventListener('click', () => {
    isHost = false;
    homeError.textContent = '';
    inputPin.value = '';
    joinError.textContent = '';
    showMenuScreen(joinScreen);
});

btnBackHome.addEventListener('click', () => {
    clearSession();
    showMenuScreen(homeScreen);
});

btnBackJoin.addEventListener('click', () => {
    showMenuScreen(joinScreen);
});

btnVerifyPin.addEventListener('click', () => {
    const pin = inputPin.value.trim();
    if (pin.length !== 6) {
        joinError.textContent = 'Il PIN deve essere di 6 cifre.';
        return;
    }
    socket.emit('checkPin', pin);
});

socket.on('pinCheckResult', (data) => {
    if (!data.valid) {
        joinError.textContent = data.message;
    } else {
        currentPin = data.pin;
        updateUrl(currentPin);
        joinError.textContent = '';
        showMenuScreen(playerConfigScreen);
    }
});

btnJoinRoom.addEventListener('click', () => {
    const name = inputName.value.trim().slice(0, MAX_NAME_LENGTH);
    const cardsCount = inputCards.value;
    if (!name) return alert('Inserisci un nome valido (massimo 20 caratteri)!');
    socket.emit('joinRoom', { pin: currentPin, name, cardsCount });
});

socket.on('joinedRoom', ({ pin, playerToken }) => {
    currentPin = pin;
    isHost = false;
    if (playerToken) {
        currentPlayerToken = playerToken;
        sessionStorage.setItem(`tombola_player_${pin}`, playerToken);
    }
    updateUrl(pin);
    displayPin.textContent = pin;
    hostControls.classList.add('hidden');
    playerWaiting.classList.remove('hidden');
    showMenuScreen(lobbyScreen);
});

socket.on('updatePlayersList', (players) => {
    playersList.innerHTML = '';
    playerCount.textContent = players.length;
    players.forEach(p => {
        const li = document.createElement('li');
        li.textContent = `${p.name} (${p.cardsCount} cartelle)`;
        playersList.appendChild(li);
    });
});

// --- AVVIO E RIPRISTINO PARTITA ---
btnStartGame.addEventListener('click', () => {
    socket.emit('startGame', currentPin);
});

socket.on('gameStartedHost', ({ hostBoards, extractedNumbers = [], allPrizes, gameOver }) => {
    renderHostBoard(hostBoards, extractedNumbers);
    if (allPrizes) renderPrizesTable(prizesTableBody, allPrizes);
    if (gameOver) {
        renderPrizesTable(gameoverTableBody, allPrizes);
        gameoverModal.classList.remove('hidden');
    }
});

socket.on('gameStartedPlayer', ({ cards, extractedNumbers = [], allPrizes }) => {
    isHost = false;
    renderPlayerCards(cards, [], extractedNumbers, null);
    if (allPrizes) renderPrizesTable(prizesTableBody, allPrizes);
});

socket.on('restorePlayerGame', ({ cards, markedNumbers, extractedNumbers, currentNumber, allPrizes, gameOver }) => {
    isHost = false;
    renderPlayerCards(cards, markedNumbers, extractedNumbers, currentNumber);
    if (allPrizes) renderPrizesTable(prizesTableBody, allPrizes);
    if (gameOver) {
        renderPrizesTable(gameoverTableBody, allPrizes);
        gameoverModal.classList.remove('hidden');
    }
});

btnExtract.addEventListener('click', () => {
    socket.emit('extractNumber', currentPin);
});

let allExtractedClient = [];

socket.on('numberExtracted', ({ number, totalExtracted }) => {
    if (!allExtractedClient.includes(number)) {
        allExtractedClient.push(number);
    }
    renderTopBar(allExtractedClient);
    if (totalExtracted === 1 && allExtractedClient.length > 1) {
        allExtractedClient = [number];
        renderTopBar(allExtractedClient);
    }

    if (isHost) {
        const cell = hostBoardGrid.querySelector(`.board-cell[data-num="${number}"]`);
        if (cell) cell.classList.add('extracted');
    } else {
        document.querySelectorAll('.card-cell.flash').forEach(el => {
            el.classList.remove('flash');
            el.classList.add('can-mark');
        });

        document.querySelectorAll(`.card-cell.number[data-num="${number}"]`).forEach(el => {
            if (!el.classList.contains('marked')) {
                el.classList.add('flash');
            }
        });
    }
});

socket.on('prizeWon', ({ winData, allPrizes }) => {
    winBanner.textContent = `${winData.winner} ha fatto ${winData.prize}! (al ${winData.atExtraction}° numero)`;
    winBanner.classList.remove('hidden');
    setTimeout(() => winBanner.classList.add('hidden'), 5000);

    renderPrizesTable(prizesTableBody, allPrizes);
});

socket.on('gameOver', ({ allPrizes }) => {
    renderPrizesTable(gameoverTableBody, allPrizes);
    gameoverModal.classList.remove('hidden');
});

btnExitHome.addEventListener('click', () => {
    const pinToLeave = currentPin;
    const tokenToLeave = currentPlayerToken;
    socket.emit('leaveRoom', { pin: pinToLeave, playerToken: tokenToLeave });
    gameoverModal.classList.add('hidden');
    prizesModal.classList.add('hidden');
    allExtractedClient = [];
    clearSession();
    showMenuScreen(homeScreen);
});

btnOpenPrizesHost.addEventListener('click', () => prizesModal.classList.remove('hidden'));
btnOpenPrizesPlayer.addEventListener('click', () => prizesModal.classList.remove('hidden'));
btnCloseModal.addEventListener('click', () => prizesModal.classList.add('hidden'));

socket.on('roomClosed', (msg) => {
    if (isLeavingManually) {
        isLeavingManually = false;
        return;
    }
    alert(msg);
    clearSession();
    showMenuScreen(homeScreen);
});