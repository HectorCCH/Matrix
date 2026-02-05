document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('command-input');
    const inputDisplay = document.getElementById('input-display');
    const output = document.getElementById('output');
    const screen = document.getElementById('crt-screen');

    // Ocultar input inicialmente (solo para la intro)
    screen.classList.add('intro-hide');

    // --- AUDIO (Sencillo) ---
    const audio = {
        ctx: null,
        enabled: true, // Activado por defecto
        init() {
            this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
            if (this.ctx.state === 'suspended') this.ctx.resume();
        },
        beep(f, type, vol, dur) {
            this.init();
            const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(f, this.ctx.currentTime);
            gain.gain.setValueAtTime(vol, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
            osc.connect(gain); gain.connect(this.ctx.destination);
            osc.start(); osc.stop(this.ctx.currentTime + dur);
        },
        playKey() {
            if (!this.enabled) return;
            // Más agudo (8000Hz) y volumen reducido
            this.beep(200 + Math.random() * 50, 'square', 0.025, 0.02);
            this.beep(8000 + Math.random() * 1000, 'sine', 0.025, 0.01);
        }
    };

    // Evento F1 eliminado


    // Focus input and init audio when clicking anywhere on screen
    screen.addEventListener('click', () => {
        audio.init();
        input.focus();
    });

    function updateInputDisplay() {
        const val = input.value;
        const caretPos = input.selectionStart;
        inputDisplay.innerHTML = '';

        if (caretPos > 0) {
            const preSpan = document.createElement('span');
            preSpan.textContent = val.substring(0, caretPos);
            inputDisplay.appendChild(preSpan);
        }

        const cursorSpan = document.createElement('span');
        cursorSpan.className = 'cursor';
        if (caretPos < val.length) {
            cursorSpan.textContent = val[caretPos];
        } else {
            cursorSpan.innerHTML = '&nbsp;';
        }
        inputDisplay.appendChild(cursorSpan);

        if (caretPos < val.length) {
            const postSpan = document.createElement('span');
            postSpan.textContent = val.substring(caretPos + 1);
            inputDisplay.appendChild(postSpan);
        }
    }

    ['input', 'keydown', 'keyup', 'click', 'focus', 'blur'].forEach(evt => {
        input.addEventListener(evt, () => {
            setTimeout(updateInputDisplay, 0);
        });
    });

    updateInputDisplay();

    let messageQueue = [];
    let isTyping = false;
    let skipCurrent = false;
    let gameStarted = false; // Mover aquí para que sea accesible

    input.addEventListener('keydown', (e) => {
        audio.init();

        // No procesar input antes de que el juego haya iniciado
        if (!gameStarted) return;

        if (isTyping) {
            if (e.key === 'Enter') skipCurrent = true;
            // Permitir recargar la página (F5 o Ctrl+R) y pantalla completa (F11)
            if (e.key === 'F5' || (e.ctrlKey && e.key === 'r') || e.key === 'F11') return;
            e.preventDefault(); // Bloquear cualquier otra tecla durante animaciones
            return;
        }

        const val = input.value;
        const start = input.selectionStart;

        if (e.key === 'Enter') {
            const command = input.value;
            printLine("<br>", "standard", false); // Separator
            printLine('> ' + command, 'standard', false);
            processCommand(command);
            input.value = '';
            setTimeout(updateInputDisplay, 0);
            audio.playKey();
        } else if (e.key === 'Backspace') {
            // Permitir borrar palabras completas con CTRL + Backspace (comportamiento nativo)
            if (e.ctrlKey) return;

            if (input.selectionStart === input.selectionEnd) {
                if (start > 0 || start < val.length) {
                    e.preventDefault();
                    if (start < val.length) {
                        input.value = val.substring(0, start) + val.substring(start + 1);
                        input.setSelectionRange(Math.max(0, start - 1), Math.max(0, start - 1));
                    } else {
                        input.value = val.substring(0, start - 1);
                        input.setSelectionRange(start - 1, start - 1);
                    }
                    updateInputDisplay();
                }
            }
        } else if (e.key === 'Delete') {
            // Permitir CTRL + Supr nativo
            if (e.ctrlKey) return;
        }
    });

    input.addEventListener('input', () => {
        if (isTyping) {
            input.value = ''; // Limpiar cualquier texto que se haya colado
            updateInputDisplay();
            return;
        }
        updateInputDisplay();
        audio.playKey();
    });

    async function printLine(text, type = 'standard', animated = true) {
        return new Promise((resolve) => {
            messageQueue.push({ text, type, animated, resolve });
            if (!isTyping) {
                isTyping = true;
                setTimeout(processQueue, 0);
            }
        });
    }

    async function processQueue() {
        if (messageQueue.length === 0) {
            isTyping = false;
            skipCurrent = false;
            screen.classList.remove('typing-active');
            input.focus();
            return;
        }

        isTyping = true;
        screen.classList.add('typing-active');

        const { text, type, animated, resolve } = messageQueue.shift();
        const line = document.createElement('div');
        line.className = 'line ' + type;
        output.appendChild(line);

        if (!animated || skipCurrent) {
            line.innerHTML = text;
            output.scrollTop = output.scrollHeight;
            resolve();
            processQueue();
            return;
        }

        const contentSpan = document.createElement('span');
        line.appendChild(contentSpan);
        const gameCursor = document.createElement('span');
        gameCursor.className = 'game-cursor';
        line.appendChild(gameCursor);

        let currentText = '';
        let i = 0;

        const typingInterval = setInterval(() => {
            if (i < text.length && !skipCurrent) {
                if (text.substring(i, i + 4) === '<br>') {
                    currentText += '<br>';
                    i += 4;
                } else {
                    currentText += text[i];
                    i++;
                }
                contentSpan.innerHTML = currentText;
                output.scrollTop = output.scrollHeight;
                audio.playKey();
            } else {
                clearInterval(typingInterval);
                if (skipCurrent) contentSpan.innerHTML = text;
                gameCursor.remove();
                resolve();
                processQueue();
            }
        }, 30);
    }

    // --- GAME ENGINE (MATRIX ADAPTATION) ---
    const gameState = {
        currentLocation: 'habitacion_101',
        inventory: [],
        flags: {
            door_knocked: false,
            read_message: false,
            has_disk: false,
            met_choi: false
        }
    };

    const world = {
        'habitacion_101': {
            description: "Habitación 101. Tu apartamento parece una celda tecnológica. Montañas de hardware, cables y monitores brillan en la oscuridad.<br>Tu 'ORDENADOR' principal está activo.<br>Una 'ESTANTERIA' vieja se apoya contra la pared.<br>Al fondo, la 'PUERTA' de salida.",
            items: [],
            interactables: {
                'ordenador': () => {
                    if (!gameState.flags.read_message) {
                        printLine("Te acercas al monitor. El texto verde ya no está... 'Sigue al conejo blanco'.");
                        printLine("De repente, un sonido seco te sobresalta.", "important");
                        printLine("<br>");
                        printLine("¡TOC TOC TOC!", "important");
                        printLine("<br>");
                        printLine("Alguien golpea tu 'PUERTA'.", "important");
                        gameState.flags.door_knocked = true;
                        gameState.flags.read_message = true;
                    } else {
                        printLine("El monitor solo muestra el cursor parpadeando. Esperando...");
                    }
                },
                'estanteria': "Está llena de libros técnicos y filosofía barata. Un 'LIBRO' destaca de entre el resto: 'Simulacra & Simulation'.",
                'puerta': () => {
                    if (gameState.flags.door_knocked) {
                        if (gameState.flags.has_disk) {
                            printLine("Abres la puerta. CHOI, DUJOUR y tres personas más están allí.");
                            startDialog('choi_encounter');
                        } else {
                            printLine("Abres la puerta ligeramente.", "info");
                            printLine("- CHOI: ¡Eh, colega! ¿Tienes lo mío?", "dialog");
                            printLine("- NEO: Claro, espera un segundo.", "dialog");
                            printLine("Cierras la puerta. Necesitas el 'DISCO' antes de salir.", "info");
                        }
                    } else {
                        printLine("No tienes motivos para salir aún. Deberías revisar tu 'ORDENADOR'.");
                    }
                },
                'libro': () => {
                    printLine("Sacas 'Simulacra & Simulation'. Lo abres por el capítulo 'On Nihilism'.");
                    if (!gameState.flags.has_disk) {
                        printLine("Dentro hay un hueco recortado. Contiene un MiniDisc pirata: DISK 067'.");
                        printLine("Añades el 'DISCO' a tu inventario.");
                        gameState.inventory.push('disco');
                        gameState.flags.has_disk = true;
                    } else {
                        printLine("El hueco secreto está vacío.");
                    }
                }
            }
        },
        'pasillo': {
            description: "El pasillo del edificio es lúgubre y huele a humedad. 'CHOI' y su chica, 'DUJOUR', están esperando junto al ascensor.",
            exits: { 'ascensor': 'calle' }
        },
        'calle': {
            description: "Tras bajar en ascensor, ves la ciudad gótica bajo la lluvia. Luces de neón se reflejan en los charcos. Al final de la calle ves el cartel del 'CLUB': 'The End'.",
            exits: { 'club': 'club', 'entrar': 'club' }
        },
        'club': {
            description: "La música industrial golpea tu pecho. Esta sonando Dragula de Rob Zombie. Humo, cuero y oscuridad. En una esquina, una figura te observa. Es 'ELLA'.",
            interactables: {
                'ella': () => startDialog('trinity_encounter'),
                'trinity': () => startDialog('trinity_encounter')
            }
        }
    };

    const dialogs = {
        'choi_encounter': [
            "- NEO: Llegas con retraso.",
            "- CHOI: Lo sé. La culpa es de ella. (mira a su novia Dujour)",
            "- NEO: ¿Tienes el dinero?",
            "- CHOI: agh... Dos mil.",
            "- NEO: Espera.",
            "<br>",
            "(Le entregas el 'DISCO 067'. Choi sonríe al ver la mercancía.)",
            "<br>",
            "- CHOI: Aleluya, me has salvado tío. Eres mi Jesucristo particular.",
            "- NEO: Como te pillen utilizando eso!!!",
            "- CHOI: Tranquilo, nunca ha pasado. Tú no existes.",
            "- NEO: exacto.",
            "- CHOI: ¿Te ocurre algo? Estás más pálido de lo normal.",
            "- NEO: Mi ordenador está... ¿Alguna vez has tenido la sensación de no saber con seguridad si sueñas o estás despierto?",
            "- CHOI: Sí, alguna vez... gracias a la mescalina. Es una buena forma de volar.",
            "<br>",
            "(DUJOUR te mira con curiosidad. Lleva un tatuaje en el hombro: un conejo blanco...)",
            "<br>",

            `                .".
               /  |
              /  /
             / ,"
  .-------.--- /
 "._ __.-/ o. o\\
     "   (    Y )
         )     /
        /       Y
     .-"         |
    /  _     \\    \\
   /    \`. ". ) /' )
  Y       )( / /(,/
 ,|      /     )
 " \\_  (__    (_
     "-._,)--._,)`,

            "<br>",
            "- DUJOUR: ¿Nos lo llevamos?",
            "- CHOI: Claro. Ven con nosotros, Neo. Tienes que desconectar.",
            "<br>",
            "(Decides seguirlos. 'Sigue al conejo blanco'...)"
        ],

        'trinity_encounter': [
            "(La mujer se acerca a ti. Sus ojos azules brillan en la oscuridad.)",
            "<br>",
            "- TRINITY: Hola, Neo.",
            "- NEO: ¿Cómo sabes mi nombre?",
            "- TRINITY: Sé mucho sobre ti.",
            "- NEO: ¿Quién eres?",
            "- TRINITY: Me llamo Trinity.",
            "- NEO: ¿Trinity? ¿La que pirateó la base de datos de Hacienda?",
            "- TRINITY: Eso fue hace tiempo.",
            "- TRINITY: Sé por qué estás aquí, Neo. Sé lo que estás haciendo. Sé por qué apenas duermes.",
            "- TRINITY: Le buscas a él. Lo sé porque una vez yo estuve buscando lo mismo.",
            "- TRINITY: Y cuando él me encontró, me dijo que en realidad no le buscaba a él. Lo que buscaba era una respuesta.",
            "- TRINITY: Es la pregunta la que te ha traído aquí. Conoces la pregunta igual que yo.",
            "- NEO: ¿Qué es Matrix?",
            "- TRINITY: La respuesta la encontrarás por ahí. Te está buscando... y te encontrará, siempre que lo desee.",
            "<br>",
            "(Trinity se acerca a tu oído y susurra)",
            "<br>",
            "- TRINITY: Despierta, Neo."
        ]
    };

    async function startDialog(dialogId) {
        isTyping = true;
        screen.classList.add('typing-active');
        const lines = dialogs[dialogId];

        // Encolar todas las líneas a la vez para que el "skip" (Enter) funcione en todo el bloque
        const promises = lines.map(line => printLine(line, 'dialog'));
        await Promise.all(promises);

        // Efectos post-diálogo
        if (dialogId === 'choi_encounter') {
            gameState.currentLocation = 'pasillo'; // Transición lógica

            // Entregas el disco, así que lo quitamos del inventario
            gameState.inventory = gameState.inventory.filter(item => item !== 'disco');

            setTimeout(() => {
                printLine("<br>Sales al pasillo. Puedes ir al 'ASCENSOR' para bajar a la calle.", 'info');
                gameState.flags.met_choi = true;
            }, 500);
        } else if (dialogId === 'trinity_encounter') {
            setTimeout(startMatrixEffect, 2000);
        }
    }

    function startMatrixEffect(isScreensaver = false) {
        // 1. Desvanecer texto actual
        const inputLine = document.querySelector('.input-line');
        output.style.transition = 'opacity 2s ease-in-out';
        inputLine.style.transition = 'opacity 2s ease-in-out';
        output.style.opacity = '0';
        inputLine.style.opacity = '0';

        // 2. Esperar a que termine el desvanecimiento para iniciar el efecto
        setTimeout(() => {
            if (isScreensaver) {
                // Solo ocultar para poder restaurar
                output.style.display = 'none';
                inputLine.style.display = 'none';
            } else {
                // Limpiar pantalla y cambiar display (modo fin de juego)
                output.innerHTML = '';
                inputLine.style.display = 'none';
            }

            // Restaurar opacidad (para cuando se vuelva a mostrar o para el canvas si afectase)
            output.style.opacity = '1';
            inputLine.style.opacity = '1';

            // Crear canvas
            const canvas = document.createElement('canvas');
            canvas.style.position = 'absolute';
            canvas.style.top = '0';
            canvas.style.left = '0';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.zIndex = '5'; // Debajo de scanlines (z-10)
            screen.appendChild(canvas);

            const ctx = canvas.getContext('2d');
            canvas.width = screen.offsetWidth;
            canvas.height = screen.offsetHeight;

            const katakana = 'アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン';
            const latin = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            const nums = '01';
            const alphabet = katakana + latin + nums;

            const fontSize = 16;
            const columns = canvas.width / fontSize;
            const drops = [];

            for (let x = 0; x < columns; x++) {
                drops[x] = 1;
            }

            function draw() {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                ctx.fillStyle = '#b3ffb3';
                ctx.font = fontSize + 'px monospace';

                for (let i = 0; i < drops.length; i++) {
                    const text = alphabet.charAt(Math.floor(Math.random() * alphabet.length));
                    ctx.fillText(text, i * fontSize, drops[i] * fontSize);

                    if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
                        drops[i] = 0;
                    }
                    drops[i]++;
                }
            }

            const intervalId = setInterval(draw, 30);

            // Si es modo salvapantallas, permitir salir con Enter
            if (isScreensaver) {
                const stopMatrix = (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        clearInterval(intervalId);
                        canvas.remove();

                        // Restaurar vista
                        output.style.display = ''; // Eliminar inline style para volver a CSS original
                        inputLine.style.display = '';

                        window.removeEventListener('keydown', stopMatrix);
                        document.getElementById('command-input').focus();
                    }
                };
                window.addEventListener('keydown', stopMatrix);
            }

        }, 2000);
    }

    const commands = {
        'cmatrix': () => { startMatrixEffect(true); },
        'ayuda': () => {
            printLine("COMANDOS DISPONIBLES:");
            printLine("- MIRAR [COSA]: Observa algo (ordenador, puerta, libro...).");
            printLine("- COGER [OBJETO]: Recoge algo.");
            printLine("- ABRIR [COSA]: Abre puertas, libros, etc.");
            printLine("- IR [SITIO]: Muévete a otro lugar.");
            printLine("- INVENTARIO: Mira lo que llevas.");
            printLine("- LIMPIAR: Limpia la terminal.");
            printLine("<br>", "standard", false);
        },
        'limpiar': () => { output.innerHTML = ''; },
        'mirar': (args) => {
            const room = world[gameState.currentLocation];
            const target = args.join(' ');

            if (!target) {
                printLine(room.description, 'info');
                if (room.items && room.items.length > 0) printLine("Ves: " + room.items.join(', '));
                printLine("<br>", "standard", false);
                return;
            }

            // Mirar objetos específicos
            if (room.interactables && room.interactables[target]) {
                const interaction = room.interactables[target];
                if (typeof interaction === 'function') interaction();
                else printLine(interaction);
                return;
            }

            // Alias comunes
            if (target === 'alrededor' || target === 'habitacion' || target === 'sala') {
                printLine(room.description, 'info');
                return;
            }

            printLine("No ves nada especial en eso.");
        },
        'inventario': () => {
            if (gameState.inventory.length === 0) printLine("Bolsillos vacíos.");
            else printLine("Inventario: " + gameState.inventory.join(', '));
            printLine("<br>", "standard", false);
        },
        'coger': (args) => {
            const item = args.join(' ');
            // Caso especial libro/disco
            if (item === 'disco' && gameState.currentLocation === 'habitacion_101') {
                if (gameState.flags.has_disk) printLine("Ya lo tienes.");
                else printLine("No lo ves. Quizás esté escondido.");
                return;
            }
            if (item === 'libro' && gameState.currentLocation === 'habitacion_101') {
                world['habitacion_101'].interactables['libro']();
                return;
            }
            printLine("No puedes coger eso.");
        },
        'abrir': (args) => {
            const target = args.join(' ');
            const room = world[gameState.currentLocation];
            if (target === 'puerta' && gameState.currentLocation === 'habitacion_101') {
                world['habitacion_101'].interactables['puerta']();
                return;
            }
            if ((target === 'libro' || target === 'simulacra') && gameState.currentLocation === 'habitacion_101') {
                world['habitacion_101'].interactables['libro']();
                return;
            }
            printLine("No se puede abrir.");
        }
    };

    function processCommand(rawInput) {
        const cleanInput = rawInput.trim().toLowerCase();
        const parts = cleanInput.split(' ');
        const mainCommand = parts[0];
        const args = parts.slice(1);

        if (cleanInput === '') return;

        if (commands[mainCommand]) { commands[mainCommand](args); return; }

        // Alias de movimiento
        if (mainCommand === 'ir' || mainCommand === 'entrar' || mainCommand === 'bajar' || mainCommand === 'subir') {
            handleMovement(args[0]);
            return;
        }

        printLine("Comando no reconocido. Prueba 'AYUDA'.");
        printLine("<br>", "standard", false);
    }

    function handleMovement(direction) {
        const room = world[gameState.currentLocation];
        // Simplificación: si hay una salida que coincide con el input (o aproximado)
        if (room.exits) {
            for (const [exitKey, exitRoom] of Object.entries(room.exits)) {
                if (direction === exitKey) {
                    // Bloqueo de historia: no salir al pasillo sin abrir puerta (evento choi)
                    if (gameState.currentLocation === 'pasillo' && exitKey === 'ascensor') {
                        // Pasar a calle
                    }

                    gameState.currentLocation = exitRoom;
                    printLine(`...`, 'info');
                    setTimeout(() => commands['mirar']([]), 300);
                    return;
                }
            }
        }
        printLine("No puedes ir por ahí.");
    }

    function handleTake(item) {
        // Obsoleto, integrado en commands['coger']
    }

    async function startIntro() {
        // Pausa inicial de 2 segundos con cursor parpadeante
        isTyping = true;
        screen.classList.add('typing-active');
        const waitLine = document.createElement('div');
        waitLine.className = 'line standard';
        const waitCursor = document.createElement('span');
        waitCursor.className = 'game-cursor blink'; // Clase blink para que parpadee durante la espera
        waitLine.appendChild(waitCursor);
        output.appendChild(waitLine);

        // Helper para esperar y limpiar pantalla
        const waitAndClear = async (ms) => {
            isTyping = true; // Bloquear input y permitir Enter para saltar
            await new Promise(resolve => {
                const start = Date.now();
                const interval = setInterval(() => {
                    if (skipCurrent || (Date.now() - start >= ms)) {
                        clearInterval(interval);
                        skipCurrent = false;
                        resolve();
                    }
                }, 50);
            });
            output.innerHTML = '';
            isTyping = false; // Permitir que la siguiente línea arranque
        };

        // Espera inicial de carga
        await new Promise(resolve => {
            const startTime = Date.now();
            const check = setInterval(() => {
                if (skipCurrent || (Date.now() - startTime >= 2000)) {
                    clearInterval(check);
                    resolve();
                }
            }, 50);
        });

        waitLine.remove();
        // Limpiamos cualquier rastro previo
        output.innerHTML = '';
        isTyping = false;

        // --- SECUENCIA DE INTRO ---

        // 1. Bloque inicial (2 líneas)
        await printLine("Call trans opt: received. 2-19-98 13:24:18 REC:Log>", "intro-text");
        await printLine("Trace program: running", "intro-text");
        await waitAndClear(2000);

        // 2. Líneas individuales
        await printLine("Despierta, Neo...", "intro-text");
        await waitAndClear(1500);

        await printLine("La Matrix te tiene...", "intro-text");
        await waitAndClear(1500);

        await printLine("Sigue al conejo blanco.", "intro-text");
        await waitAndClear(2000);

        await printLine("Knok, Knok, Neo.", "intro-text");
        await waitAndClear(1500);

        // Mensaje final (no se borra)
        await printLine("Escribe 'AYUDA' si quieres los comandos o 'MIRAR' si quieres empezar.", "intro-text");

        // Fin de la intro: permitir input del jugador
        screen.classList.remove('intro-hide');
    }

    // Cursor inicial de espera (antes del clic)
    const initialWaitLine = document.createElement('div');
    initialWaitLine.className = 'line standard';
    const initialWaitCursor = document.createElement('span');
    initialWaitCursor.className = 'game-cursor blink';
    initialWaitLine.appendChild(initialWaitCursor);
    output.appendChild(initialWaitLine);

    // Iniciar juego al hacer clic o pulsar tecla
    function initGame(e) {
        if (gameStarted) return;

        // Ignorar teclas de función (F1-F12) y Escape
        if (e && e.type === 'keydown' && (/^F\d+$/.test(e.key) || e.key === 'Escape')) return;

        gameStarted = true;

        audio.init();
        if (initialWaitLine.parentNode) initialWaitLine.remove();
        startIntro();
    }

    screen.addEventListener('click', initGame);
    window.addEventListener('keydown', initGame);
});
