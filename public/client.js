const socket = io();

// Schermate
const menuContainer = document.getElementById('menu-container');
const homeScreen = document.getElementById('home-screen');
const joinScreen = document.getElementById('join-screen');
const playerConfigScreen = document.getElementById('player-config-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const hostGameScreen = document.getElementById('host-game-screen');
const playerGameScreen = document.getElementById('player-game-screen');

// Controlli Menu
const btnCreate = document.getElementById('btn-create');
const btnJoin = document.getElementById('btn-join');
const btnVerifyPin = document.getElementById('btn-verify-pin');
const btnBackHome = document.getElementById('btn-back-home');
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

// Controlli Gioco
const btnExtract = document.getElementById('btn-extract');
const extractedCounter = document.getElementById('extracted-counter');
const lastSixContainer = document.getElementById('last-six-container');
const hostBoardGrid = document.getElementById('host-board-grid');

const playerCurrentNum = document.getElementById('player-current-num');
const playerCardsGrid = document.getElementById('player-cards-grid');

// Modale e Banner
const winBanner = document.getElementById('win-banner');
const prizesModal = document.getElementById('prizes-modal');
const prizesTableBody = document.getElementById('prizes-table-body');
const btnOpenPrizesHost = document.getElementById('btn-open-prizes-host');
const btnOpenPrizesPlayer = document.getElementById('btn-open-prizes-player');
const btnCloseModal = document.getElementById('btn-close-modal');

let currentPin = '';
let isHost = false;

function showMenuScreen(screen) {
    [homeScreen, joinScreen, playerConfigScreen, lobbyScreen].forEach(s => s.classList.add('hidden'));
    screen.classList.remove('hidden');
}

// --- GESTIONE URL E PERSISTENZA AL CARICAMENTO ---
window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const pinParam = urlParams.get('pin');
    const roleParam = urlParams.get('role');

    if (pinParam) {
        currentPin = pinParam;
        if (roleParam === 'host') {
            isHost = true;
            // Se ricarica ed è host, chiediamo al server di riagganciare la stanza o ricrearla se persa dal server
            socket.emit('reconnectHost', currentPin);
        } else {
            // Se è un giocatore, mostra direttamente la schermata di inserimento nome per rientrare
            inputPin.value = currentPin;
            showMenuScreen(playerConfigScreen);
        }
    }
});

// Funzione di utilità per aggiornare l'URL senza ricaricare la pagina
function updateUrl(pin, role = '') {
    const newUrl = `${window.location.pathname}?pin=${pin}${role ? '&role=' + role : ''}`;
    window.history.pushState({ pin }, '', newUrl);
}

// --- FLUSSO LOBBY ---
btnCreate.addEventListener('click', () => {
    isHost = true;
    socket.emit('createRoom');
});

socket.on('roomCreated', ({ pin }) => {
    currentPin = pin;
    updateUrl(pin, 'host'); // Aggiunge il PIN e il ruolo host all'URL
    displayPin.textContent = pin;
    hostControls.classList.remove('hidden');
    playerWaiting.classList.add('hidden');
    showMenuScreen(lobbyScreen);
});

btnJoin.addEventListener('click', () => {
    isHost = false;
    inputPin.value = '';
    joinError.textContent = '';
    showMenuScreen(joinScreen);
});

btnBackHome.addEventListener('click', () => {
    window.history.pushState({}, '', window.location.pathname); // Pulisce l'URL
    showMenuScreen(homeScreen);
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
        updateUrl(currentPin); // Aggiunge il PIN all'URL
        joinError.textContent = '';
        showMenuScreen(playerConfigScreen);
    }
});

btnJoinRoom.addEventListener('click', () => {
    const name = inputName.value.trim();
    const cardsCount = inputCards.value;
    if (!name) return alert('Inserisci un nome valido!');
    socket.emit('joinRoom', { pin: currentPin, name, cardsCount });
});

socket.on('joinedRoom', ({ pin }) => {
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

// --- AVVIO PARTITA ---
btnStartGame.addEventListener('click', () => {
    socket.emit('startGame', currentPin);
});

socket.on('gameStartedHost', ({ hostBoards }) => {
    menuContainer.classList.add('hidden');
    hostGameScreen.classList.remove('hidden');

    hostBoardGrid.innerHTML = '';
    hostBoards.forEach(quadrant => {
        const qDiv = document.createElement('div');
        qDiv.className = 'quadrant';
        quadrant.forEach(row => {
            row.forEach(num => {
                const cell = document.createElement('div');
                cell.className = 'board-cell';
                cell.dataset.num = num;
                cell.textContent = num;
                qDiv.appendChild(cell);
            });
        });
        hostBoardGrid.appendChild(qDiv);
    });
});

socket.on('gameStartedPlayer', ({ cards }) => {
    menuContainer.classList.add('hidden');
    playerGameScreen.classList.remove('hidden');

    playerCardsGrid.innerHTML = '';
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

                    cell.addEventListener('click', () => {
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
});

btnExtract.addEventListener('click', () => {
    socket.emit('extractNumber', currentPin);
});

socket.on('numberExtracted', ({ number, totalExtracted, lastSix }) => {
    if (isHost) {
        extractedCounter.textContent = `${totalExtracted} / 90`;
        lastSixContainer.innerHTML = '';
        lastSix.forEach((n, idx) => {
            const pill = document.createElement('div');
            pill.className = idx === 0 ? 'num-pill latest' : 'num-pill';
            pill.textContent = n;
            lastSixContainer.appendChild(pill);
        });

        const cell = hostBoardGrid.querySelector(`.board-cell[data-num="${number}"]`);
        if (cell) cell.classList.add('extracted');
    } else {
        playerCurrentNum.textContent = number;

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
    winBanner.textContent = `🎉 ${winData.winner} ha fatto ${winData.prize}! (al ${winData.atExtraction}° numero)`;
    winBanner.classList.remove('hidden');
    setTimeout(() => winBanner.classList.add('hidden'), 5000);

    const order = ['ambo', 'terna', 'quaterna', 'cinquina', 'tombola'];
    prizesTableBody.innerHTML = '';
    order.forEach(key => {
        const info = allPrizes[key];
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${key.toUpperCase()}</strong></td>
            <td>${info ? info.winner : '-'}</td>
            <td>${info ? info.atExtraction + '° estr.' : '-'}</td>
        `;
        prizesTableBody.appendChild(tr);
    });
});

btnOpenPrizesHost.addEventListener('click', () => prizesModal.classList.remove('hidden'));
btnOpenPrizesPlayer.addEventListener('click', () => prizesModal.classList.remove('hidden'));
btnCloseModal.addEventListener('click', () => prizesModal.classList.add('hidden'));

socket.on('roomClosed', (msg) => {
    alert(msg);
    window.history.pushState({}, '', window.location.pathname);
    window.location.reload();
});