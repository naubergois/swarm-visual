/**
 * Efeitos Sonoros e Feedback Imersivo.
 * TASK-024: 🔊 Swarm Visual — Efeitos Sonoros e Feedback Imersivo
 *
 * Usa Web Audio API para gerar sons procedurais sem arquivos externos.
 */

const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

function playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume: number = 0.1) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.value = volume;
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

/** Som de agente pegando tarefa */
export function soundPickTask() {
  playTone(440, 0.1, 'square', 0.05);
  setTimeout(() => playTone(550, 0.1, 'square', 0.05), 80);
}

/** Som de tarefa concluída */
export function soundTaskDone() {
  playTone(523, 0.12, 'sine', 0.08);
  setTimeout(() => playTone(659, 0.12, 'sine', 0.08), 100);
  setTimeout(() => playTone(784, 0.2, 'sine', 0.08), 200);
}

/** Som de conexão MCP estabelecida */
export function soundMcpConnected() {
  playTone(330, 0.15, 'triangle', 0.06);
  setTimeout(() => playTone(440, 0.15, 'triangle', 0.06), 120);
  setTimeout(() => playTone(660, 0.25, 'triangle', 0.06), 240);
}

/** Som de erro */
export function soundError() {
  playTone(200, 0.3, 'sawtooth', 0.04);
  setTimeout(() => playTone(150, 0.3, 'sawtooth', 0.04), 150);
}

/** Som sutil de hover/interação */
export function soundHover() {
  playTone(800, 0.05, 'sine', 0.02);
}

/** Som de notificação (nova mensagem, card novo) */
export function soundNotification() {
  playTone(880, 0.08, 'sine', 0.05);
  setTimeout(() => playTone(1100, 0.12, 'sine', 0.05), 80);
}

/** Resumo do audioContext */
export function resumeAudio() {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}
