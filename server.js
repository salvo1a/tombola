const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const MAX_NAME_LENGTH = 20;

function sanitizeName(name) {
    if (typeof name !== 'string') return '';
    return name.trim().slice(0, MAX_NAME_LENGTH);
}

function generateUniquePin() {
    let pin;
    do {
        pin = Math.floor(100000 + Math.random() * 900000).toString();
    } while (rooms[pin]);
    return pin;
}

function generateHostBoards() {
    const boards = [];
    const startOffsets = [1, 6, 31, 36, 61, 66];
    for (let b = 0; b < 6; b++) {
        const start = startOffsets[b];
        const rows = [];
        for (let r = 0; r < 3; r++) {
            const row = [];
            for (let c = 0; c < 5; c++) {
                row.push(start + r * 10 + c);
            }
            rows.push(row);
        }
        boards.push(rows);
    }
    return boards;
}

function generatePlayerCard() {
    while (true) {
        const grid = Array.from({ length: 3 }, () => Array(9).fill(null));
        const colCounts = Array(9).fill(0);

        for (let r = 0; r < 3; r++) {
            const cols = [0, 1, 2, 3, 4, 5, 6, 7, 8].sort(() => Math.random() - 0.5).slice(0, 5);
            cols.forEach(c => {
                grid[r][c] = true;
                colCounts[c]++;
            });
        }

        if (colCounts.some(count => count === 0)) continue;

        for (let c = 0; c < 9; c++) {
            const min = c === 0 ? 1 : c * 10;
            const max = c === 8 ? 90 : c * 10 + 9;
            const pool = [];
            for (let n = min; n <= max; n++) pool.push(n);

            const chosen = pool.sort(() => Math.random() - 0.5).slice(0, colCounts[c]).sort((a, b) => a - b);
            let idx = 0;
            for (let r = 0; r < 3; r++) {
                if (grid[r][c] === true) {
                    grid[r][c] = chosen[idx++];
                }
            }
        }
        return grid;
    }
}

function checkPrizes(room, boards, markedSet, winnerName) {
    const prizeOrder = ['ambo', 'terna', 'quaterna', 'cinquina', 'tombola'];
    const nextPrize = prizeOrder.find(p => !room.prizesWon[p]);
    if (!nextPrize) return;

    const targetPerRow = { ambo: 2, terna: 3, quaterna: 4, cinquina: 5 };
    let won = false;

    for (const board of boards) {
        if (nextPrize === 'tombola') {
            let totalMarked = 0;
            board.forEach(row => row.forEach(num => {
                if (num !== null && markedSet.has(num)) totalMarked++;
            }));
            if (totalMarked === 15) {
                won = true;
                break;
            }
        } else {
            const target = targetPerRow[nextPrize];
            for (const row of board) {
                let rowMarked = 0;
                row.forEach(num => {
                    if (num !== null && markedSet.has(num)) rowMarked++;
                });
                if (rowMarked >= target) {
                    won = true;
                    break;
                }
            }
        }
        if (won) break;
    }

    if (won) {
        const winData = {
            prize: nextPrize.toUpperCase(),
            winner: winnerName,
            atExtraction: room.extractedNumbers.length
        };
        room.prizesWon[nextPrize] = winData;
        io.to(room.pin).emit('prizeWon', {
            winData,
            allPrizes: room.prizesWon
        });

        if (nextPrize === 'tombola') {
            room.gameOver = true;
            io.to(room.pin).emit('gameOver', {
                allPrizes: room.prizesWon
            });
        }
    }
}

function getPublicPlayers(room) {
    return room.players.map(p => ({
        name: p.name,
        cardsCount: p.cardsCount
    }));
}

io.on('connection', (socket) => {
    // 1. CREAZIONE STANZA
    socket.on('createRoom', ({ hostName } = {}) => {
        const cleanHostName = sanitizeName(hostName);
        if (!cleanHostName) {
            return socket.emit('createRoomError', 'Inserisci il tuo nome (max 20 caratteri).');
        }

        const pin = generateUniquePin();
        rooms[pin] = {
            pin,
            hostId: socket.id,
            hostName: cleanHostName,
            disconnectTimeout: null,
            gameStarted: false,
            gameOver: false,
            players: [],
            extractedNumbers: [],
            currentNumber: null,
            hostBoards: generateHostBoards(),
            prizesWon: { ambo: null, terna: null, quaterna: null, cinquina: null, tombola: null }
        };
        socket.join(pin);
        socket.emit('roomCreated', { pin, hostName: cleanHostName });
    });

    // RICONNESSIONE HOST
    socket.on('reconnectHost', ({ pin, hostName } = {}) => {
        const room = rooms[pin];
        if (room) {
            if (room.disconnectTimeout) {
                clearTimeout(room.disconnectTimeout);
                room.disconnectTimeout = null;
            }
            room.hostId = socket.id;
            if (sanitizeName(hostName)) {
                room.hostName = sanitizeName(hostName);
            }
            socket.join(pin);

            if (room.gameStarted) {
                socket.emit('gameStartedHost', {
                    hostBoards: room.hostBoards,
                    extractedNumbers: room.extractedNumbers,
                    allPrizes: room.prizesWon,
                    gameOver: room.gameOver
                });
            } else {
                socket.emit('roomCreated', { pin, hostName: room.hostName });
                io.to(pin).emit('updatePlayersList', getPublicPlayers(room));
            }
        } else {
            const cleanHostName = sanitizeName(hostName) || 'Host';
            rooms[pin] = {
                pin,
                hostId: socket.id,
                hostName: cleanHostName,
                disconnectTimeout: null,
                gameStarted: false,
                gameOver: false,
                players: [],
                extractedNumbers: [],
                currentNumber: null,
                hostBoards: generateHostBoards(),
                prizesWon: { ambo: null, terna: null, quaterna: null, cinquina: null, tombola: null }
            };
            socket.join(pin);
            socket.emit('roomCreated', { pin, hostName: cleanHostName });
        }
    });

    // RICONNESSIONE GIOCATORE VIA TOKEN
    socket.on('reconnectPlayer', ({ pin, playerToken }) => {
        const room = rooms[pin];
        if (!room || !playerToken) {
            return socket.emit('reconnectPlayerFailed');
        }

        const player = room.players.find(p => p.token === playerToken);
        if (!player) {
            return socket.emit('reconnectPlayerFailed');
        }

        if (player.disconnectTimeout) {
            clearTimeout(player.disconnectTimeout);
            player.disconnectTimeout = null;
        }

        player.id = socket.id;
        socket.join(pin);

        if (room.gameStarted) {
            socket.emit('restorePlayerGame', {
                cards: player.cards,
                markedNumbers: Array.from(player.markedNumbers),
                extractedNumbers: room.extractedNumbers,
                currentNumber: room.currentNumber,
                allPrizes: room.prizesWon,
                gameOver: room.gameOver
            });
        } else {
            socket.emit('joinedRoom', { pin, playerToken: player.token });
            io.to(pin).emit('updatePlayersList', getPublicPlayers(room));
        }
    });

    // 2. VERIFICA PIN
    socket.on('checkPin', (pin) => {
        const room = rooms[pin];
        if (!room) return socket.emit('pinCheckResult', { valid: false, message: 'Stanza inesistente.' });
        if (room.gameStarted) return socket.emit('pinCheckResult', { valid: false, message: 'La partita è già iniziata!' });
        if (room.players.length >= 8) return socket.emit('pinCheckResult', { valid: false, message: 'Stanza piena (massimo 8 giocatori).' });
        socket.emit('pinCheckResult', { valid: true, pin });
    });

    // 3. INGRESSO GIOCATORE
    socket.on('joinRoom', ({ pin, name, cardsCount }) => {
        const room = rooms[pin];
        if (!room || room.gameStarted || room.players.length >= 8) return;

        const cleanName = sanitizeName(name);
        if (!cleanName) return;

        const playerToken = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const newPlayer = {
            token: playerToken,
            id: socket.id,
            name: cleanName,
            cardsCount: Math.min(Math.max(parseInt(cardsCount) || 1, 1), 6),
            cards: [],
            markedNumbers: new Set(),
            disconnectTimeout: null
        };

        room.players.push(newPlayer);
        socket.join(pin);
        socket.emit('joinedRoom', { pin, playerToken });
        io.to(pin).emit('updatePlayersList', getPublicPlayers(room));
    });

    // 4. AVVIO PARTITA (Host)
    socket.on('startGame', (pin) => {
        const room = rooms[pin];
        if (!room || room.hostId !== socket.id) return;

        room.gameStarted = true;
        room.gameOver = false;

        room.players.forEach(p => {
            p.cards = [];
            for (let i = 0; i < p.cardsCount; i++) {
                p.cards.push(generatePlayerCard());
            }
            io.to(p.id).emit('gameStartedPlayer', {
                cards: p.cards,
                extractedNumbers: room.extractedNumbers,
                allPrizes: room.prizesWon
            });
        });

        socket.emit('gameStartedHost', {
            hostBoards: room.hostBoards,
            extractedNumbers: room.extractedNumbers,
            allPrizes: room.prizesWon,
            gameOver: room.gameOver
        });
    });

    // 5. ESTRAZIONE NUMERO (Host)
    socket.on('extractNumber', (pin) => {
        const room = rooms[pin];
        if (!room || room.hostId !== socket.id || !room.gameStarted || room.gameOver) return;
        if (room.extractedNumbers.length >= 90 || room.prizesWon.tombola) return;

        let num;
        do {
            num = Math.floor(Math.random() * 90) + 1;
        } while (room.extractedNumbers.includes(num));

        room.extractedNumbers.push(num);
        room.currentNumber = num;

        io.to(pin).emit('numberExtracted', {
            number: num,
            totalExtracted: room.extractedNumbers.length,
            lastSix: room.extractedNumbers.slice(-6).reverse()
        });

        const hostSet = new Set(room.extractedNumbers);
        checkPrizes(room, room.hostBoards, hostSet, room.hostName);
    });

    // 6. GIOCATORE CLICCA UN NUMERO SULLA CARTELLA
    socket.on('markNumber', ({ pin, number }) => {
        const room = rooms[pin];
        if (!room || !room.gameStarted || room.gameOver) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        if (!room.extractedNumbers.includes(number)) return;

        player.markedNumbers.add(number);

        if (number === room.currentNumber) {
            checkPrizes(room, player.cards, player.markedNumbers, player.name);
        }
    });

    // USCITA MANUALE DALLA PARTITA
    socket.on('leaveRoom', ({ pin, playerToken } = {}) => {
        const room = rooms[pin];
        if (!room) return;

        if (room.hostId === socket.id) {
            io.to(pin).emit('roomClosed', 'L\'Host ha terminato la partita.');
            delete rooms[pin];
            return;
        }

        const idx = room.players.findIndex(p => p.id === socket.id || (playerToken && p.token === playerToken));
        if (idx !== -1) {
            room.players.splice(idx, 1);
            io.to(pin).emit('updatePlayersList', getPublicPlayers(room));
        }
    });

    // 7. DISCONNESSIONE CON TOLLERANZA PER REFRESH
    socket.on('disconnect', () => {
        for (const pin in rooms) {
            const room = rooms[pin];
            if (room.hostId === socket.id) {
                room.disconnectTimeout = setTimeout(() => {
                    if (rooms[pin]) {
                        io.to(pin).emit('roomClosed', 'L\'Host ha chiuso la stanza.');
                        delete rooms[pin];
                    }
                }, 4000);
                break;
            }

            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                player.disconnectTimeout = setTimeout(() => {
                    const currentRoom = rooms[pin];
                    if (!currentRoom) return;
                    const idx = currentRoom.players.findIndex(p => p.token === player.token);
                    if (idx !== -1) {
                        currentRoom.players.splice(idx, 1);
                        io.to(pin).emit('updatePlayersList', getPublicPlayers(currentRoom));
                    }
                }, 4000);
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server avviato sulla porta ${PORT}`));