const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

// Genera un PIN univoco a 6 cifre
function generateUniquePin() {
    let pin;
    do {
        pin = Math.floor(100000 + Math.random() * 900000).toString();
    } while (rooms[pin]);
    return pin;
}

// Genera i 6 quadranti fissi del tabellone dell'Host (come nella cartella tradizionale)
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

// Genera una cartella classica 3x9 valida
function generatePlayerCard() {
    while (true) {
        const grid = Array.from({ length: 3 }, () => Array(9).fill(null));
        const colCounts = Array(9).fill(0);
        let valid = true;

        // 1. Scegli 5 colonne per ogni riga
        for (let r = 0; r < 3; r++) {
            const cols = [0, 1, 2, 3, 4, 5, 6, 7, 8].sort(() => Math.random() - 0.5).slice(0, 5);
            cols.forEach(c => {
                grid[r][c] = true;
                colCounts[c]++;
            });
        }

        // Ogni colonna deve avere almeno 1 numero
        if (colCounts.some(count => count === 0)) continue;

        // 2. Popola con numeri casuali ordinati per colonna
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
        if (valid) return grid;
    }
}

// Controlla se una serie di cartelle ha raggiunto il prossimo premio disponibile
function checkPrizes(room, boards, markedSet, winnerName, isHost) {
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
    }
}

io.on('connection', (socket) => {
    // 1. CREAZIONE STANZA
    socket.on('createRoom', () => {
        const pin = generateUniquePin();
        rooms[pin] = {
            pin,
            hostId: socket.id,
            disconnectTimeout: null,
            gameStarted: false,
            players: [],
            extractedNumbers: [],
            currentNumber: null,
            hostBoards: generateHostBoards(),
            prizesWon: { ambo: null, terna: null, quaterna: null, cinquina: null, tombola: null }
        };
        socket.join(pin);
        socket.emit('roomCreated', { pin });
    });

    // RICONNESSIONE DELL'HOST (se ricarica la pagina con l'URL salvato)
    socket.on('reconnectHost', (pin) => {
        if (rooms[pin]) {
            // Annulla l'eventuale timer di chiusura stanza attivato dal refresh
            if (rooms[pin].disconnectTimeout) {
                clearTimeout(rooms[pin].disconnectTimeout);
                rooms[pin].disconnectTimeout = null;
            }

            rooms[pin].hostId = socket.id;
            socket.join(pin);
            
            if (rooms[pin].gameStarted) {
                // Se la partita era già iniziata, rimanda il tabellone
                socket.emit('gameStartedHost', { hostBoards: rooms[pin].hostBoards });
                
                // Riallinea anche i numeri già estratti sul tabellone dell'Host
                if (rooms[pin].extractedNumbers.length > 0) {
                    rooms[pin].extractedNumbers.forEach((num, idx) => {
                        socket.emit('numberExtracted', {
                            number: num,
                            totalExtracted: idx + 1,
                            lastSix: rooms[pin].extractedNumbers.slice(0, idx + 1).slice(-6).reverse()
                        });
                    });
                }
            } else {
                // Altrimenti ricarica la lobby con il conteggio giocatori attuale
                socket.emit('roomCreated', { pin });
                io.to(pin).emit('updatePlayersList', rooms[pin].players);
            }
            console.log(`Host riconnesso alla stanza ${pin}`);
        } else {
            // Se la stanza non esiste più sul server (es. riavvio del server), ne crea una nuova con quel PIN
            rooms[pin] = {
                pin,
                hostId: socket.id,
                disconnectTimeout: null,
                gameStarted: false,
                players: [],
                extractedNumbers: [],
                currentNumber: null,
                hostBoards: generateHostBoards(),
                prizesWon: { ambo: null, terna: null, quaterna: null, cinquina: null, tombola: null }
            };
            socket.join(pin);
            socket.emit('roomCreated', { pin });
            console.log(`Stanza ${pin} ricreata per riconnessione Host.`);
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

        const newPlayer = {
            id: socket.id,
            name: name.trim(),
            cardsCount: Math.min(Math.max(parseInt(cardsCount) || 1, 1), 6),
            cards: [],
            markedNumbers: new Set()
        };

        room.players.push(newPlayer);
        socket.join(pin);
        socket.emit('joinedRoom', { pin, player: newPlayer });
        io.to(pin).emit('updatePlayersList', room.players);
    });

    // 4. AVVIO PARTITA (Host)
    socket.on('startGame', (pin) => {
        const room = rooms[pin];
        if (!room || room.hostId !== socket.id) return;

        room.gameStarted = true;

        // Genera le cartelle per ogni giocatore
        room.players.forEach(p => {
            p.cards = [];
            for (let i = 0; i < p.cardsCount; i++) {
                p.cards.push(generatePlayerCard());
            }
            io.to(p.id).emit('gameStartedPlayer', { cards: p.cards });
        });

        // Invia il tabellone all'Host
        socket.emit('gameStartedHost', { hostBoards: room.hostBoards });
    });

    // 5. ESTRAZIONE NUMERO (Host)
    socket.on('extractNumber', (pin) => {
        const room = rooms[pin];
        if (!room || room.hostId !== socket.id || !room.gameStarted) return;
        if (room.extractedNumbers.length >= 90 || room.prizesWon.tombola) return;

        let num;
        do {
            num = Math.floor(Math.random() * 90) + 1;
        } while (room.extractedNumbers.includes(num));

        room.extractedNumbers.push(num);
        room.currentNumber = num;

        // Invia l'estrazione a tutta la stanza
        io.to(pin).emit('numberExtracted', {
            number: num,
            totalExtracted: room.extractedNumbers.length,
            lastSix: room.extractedNumbers.slice(-6).reverse()
        });

        // L'Host gioca in automatico col suo tabellone: controlliamo subito se vince qualcosa
        const hostSet = new Set(room.extractedNumbers);
        checkPrizes(room, room.hostBoards, hostSet, 'Host (Tabellone)', true);
    });

    // 6. GIOCATORE CLICCA UN NUMERO SULLA CARTELLA
    socket.on('markNumber', ({ pin, number }) => {
        const room = rooms[pin];
        if (!room || !room.gameStarted) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        // Il numero deve essere effettivamente già uscito
        if (!room.extractedNumbers.includes(number)) return;

        player.markedNumbers.add(number);

        // REGOLA DEL TURNO: vale per i premi SOLO se il numero cliccato è quello attualmente estratto
        if (number === room.currentNumber) {
            checkPrizes(room, player.cards, player.markedNumbers, player.name, false);
        }
    });

    // 7. DISCONNESSIONE
    socket.on('disconnect', () => {
        for (const pin in rooms) {
            const room = rooms[pin];
            if (room.hostId === socket.id) {
                // Diamo 3 secondi di tolleranza prima di chiudere la stanza (per gestire il refresh F5 dell'Host)
                room.disconnectTimeout = setTimeout(() => {
                    if (rooms[pin]) {
                        io.to(pin).emit('roomClosed', 'L\'Host ha chiuso la stanza.');
                        delete rooms[pin];
                    }
                }, 3000);
                break;
            }
            const idx = room.players.findIndex(p => p.id === socket.id);
            if (idx !== -1) {
                room.players.splice(idx, 1);
                io.to(pin).emit('updatePlayersList', room.players);
                break;
            }
        }
    });
});

const PORT = 3000;
server.listen(PORT, () => console.log(`Server avviato su http://localhost:${PORT}`));