"use client";

import React, { useEffect, useRef, useState } from 'react';
import { saveGameRecord, getLeaderboard } from '@/app/actions';

const PADDLE_WIDTH = 110;
const PADDLE_HEIGHT = 12;
const BALL_RADIUS = 7;
const BRICK_ROWS = 5;
const BRICK_COLS = 8;
const BRICK_PADDING = 8;
const BRICK_OFFSET_TOP = 60;
const BRICK_OFFSET_LEFT = 30;
const BRICK_HEIGHT = 24;

type GameState = 'IDLE' | 'PLAYING' | 'PAUSED' | 'GAMEOVER' | 'VICTORY';

export default function BreakoutGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('IDLE');
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [playerName, setPlayerName] = useState('');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [redBricksRemoved, setRedBricksRemoved] = useState(0);
  const [time, setTime] = useState(0);
  const [leaderboard, setLeaderboard] = useState<{name: string, time: string}[]>([]);
  const countdownRef = useRef<number | null>(null);
  const hasSavedRecord = useRef(false);
  
  const ball = useRef({ x: 0, y: 0, dx: 4, dy: -4 });
  const paddle = useRef({ x: 0 });
  const bricks = useRef<any[]>([]);
  const animationFrameId = useRef<number>(0);
  const particles = useRef<any[]>([]);
  const keys = useRef({ left: false, right: false });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const PADDLE_SPEED = 6;

  // Synthesize hit sound (Audible Retro Style)
  const playHitSound = () => {
    try {
      if (!audioContext.current) {
        audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const ctx = audioContext.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'triangle'; // Richer sound than sine
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.15);
      
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {
      console.error("Audio Synthesis Error: ", e);
    }
  };

  // Handle Background Music
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (!audioRef.current) {
        const audio = new Audio('/Hyper_Speed_Run.mp3');
        audio.loop = true;
        audio.volume = 0.1;
        audio.preload = 'auto'; // Load for smooth playback
        audioRef.current = audio;
      }
      
      if (gameState === 'PLAYING') {
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch((e) => console.log("Audio play deferred till user interaction: ", e));
        }
      } else {
        audioRef.current.pause();
        if (gameState === 'IDLE') {
          audioRef.current.currentTime = 0;
        }
      }
    }
    
    return () => {
      audioRef.current?.pause();
    };
  }, [gameState]);

  const createConfetti = (x: number, y: number, isInitial = false) => {
    const colors = ['#fca5a5', '#fdba74', '#fef08a', '#93c5fd', '#86efac', '#d8b4fe'];
    const particleCount = isInitial ? 150 : 40;
    
    for (let i = 0; i < particleCount; i++) {
      const angle = isInitial ? Math.random() * Math.PI * 2 : (Math.PI / 2) + (Math.random() - 0.5);
      const speed = isInitial ? 2 + Math.random() * 8 : 1 + Math.random() * 3;
      particles.current.push({
        x: x,
        y: y,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 8 + Math.random() * 8, // Larger
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 15,
        life: 1.0,
        decay: 0.003 + Math.random() * 0.005 // Last even longer
      });
    }
  };

  const initGame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    paddle.current.x = (canvas.width - PADDLE_WIDTH) / 2;
    ball.current = {
      x: canvas.width / 2,
      y: canvas.height - 40,
      dx: 3 * (Math.random() > 0.5 ? 1 : -1),
      dy: -3
    };

    const tempBricks = [];
    const canvasWidth = canvas.width;
    const availableWidth = canvasWidth - (BRICK_OFFSET_LEFT * 2);
    const brickWidth = (availableWidth - (BRICK_COLS - 1) * BRICK_PADDING) / BRICK_COLS;

    // Light pastel color palette
    const RED_COLOR = '#fca5a5';
    const otherColors = ['#fdba74', '#fef08a', '#93c5fd', '#86efac', '#d8b4fe'];
    
    const totalBricks = BRICK_ROWS * BRICK_COLS;
    const redCount = Math.floor(totalBricks * 0.3); // 30%
    
    const colorPool: string[] = [];
    for (let i = 0; i < redCount; i++) colorPool.push(RED_COLOR);
    for (let i = 0; i < totalBricks - redCount; i++) {
      colorPool.push(otherColors[Math.floor(Math.random() * otherColors.length)]);
    }
    
    // Simple array shuffle
    for (let i = colorPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [colorPool[i], colorPool[j]] = [colorPool[j], colorPool[i]];
    }

    let colorIndex = 0;
    for (let c = 0; c < BRICK_COLS; c++) {
      tempBricks[c] = [];
      for (let r = 0; r < BRICK_ROWS; r++) {
        tempBricks[c][r] = { 
          x: 0, 
          y: 0, 
          status: 1, 
          color: colorPool[colorIndex++],
          width: brickWidth
        };
      }
    }
    bricks.current = tempBricks;
  };

  const startGame = () => {
    setScore(0);
    setLives(3);
    setRedBricksRemoved(0);
    setTime(0);
    hasSavedRecord.current = false;
    initGame();
    setGameState('PLAYING');
    setCountdown(3);
  };

  // Countdown Timer Effect
  useEffect(() => {
    if (gameState === 'VICTORY') {
      const canvas = canvasRef.current;
      if (canvas) {
        createConfetti(canvas.width / 2, canvas.height / 2, true);
        createConfetti(canvas.width * 0.2, canvas.height / 2, true);
        createConfetti(canvas.width * 0.8, canvas.height / 2, true);
      }

      // Save to Google Sheets
      if (!hasSavedRecord.current) {
        hasSavedRecord.current = true;
        saveGameRecord(playerName, formatTime(time)).then(() => {
          // Fetch updated leaderboard after saving
          getLeaderboard().then(data => setLeaderboard(data));
        });
      }
    } else {
      particles.current = []; // Clear on other states
    }
  }, [gameState]);

  // Countdown Timer Effect
  useEffect(() => {
    countdownRef.current = countdown;
    if (countdown !== null && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0) {
      const timer = setTimeout(() => {
        setCountdown(null);
        countdownRef.current = null;
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // Game Play Timer Effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (gameState === 'PLAYING' && countdown === null) {
      interval = setInterval(() => {
        setTime(t => t + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameState, countdown]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') keys.current.left = true;
      if (e.key === 'ArrowRight') keys.current.right = true;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') keys.current.left = false;
      if (e.key === 'ArrowRight') keys.current.right = false;
    };

    const handleTouch = (e: TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      const relativeX = (touch.clientX - rect.left) * (canvas.width / rect.width);
      if (relativeX > 0 && relativeX < canvas.width) {
        paddle.current.x = relativeX - PADDLE_WIDTH / 2;
      }
      e.preventDefault();
    };

    const drawBall = () => {
      ctx.beginPath();
      ctx.arc(ball.current.x, ball.current.y, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = "#18181b"; // Dark Zinc
      ctx.fill();
      ctx.closePath();
    };

    const drawPaddle = () => {
      ctx.beginPath();
      ctx.roundRect(paddle.current.x, canvas.height - PADDLE_HEIGHT - 15, PADDLE_WIDTH, PADDLE_HEIGHT, 6);
      ctx.fillStyle = "#2563eb"; // Blue-600
      ctx.fill();
      ctx.closePath();
    };

    const drawBricks = () => {
      bricks.current.forEach((column, c) => {
        column.forEach((brick: any, r: number) => {
          if (brick.status === 1) {
            const brickX = c * (brick.width + BRICK_PADDING) + BRICK_OFFSET_LEFT;
            const brickY = r * (BRICK_HEIGHT + BRICK_PADDING) + BRICK_OFFSET_TOP;
            brick.x = brickX;
            brick.y = brickY;
            
            ctx.beginPath();
            ctx.roundRect(brickX, brickY, brick.width, BRICK_HEIGHT, 4);
            ctx.fillStyle = brick.color;
            ctx.fill();
            ctx.closePath();
          }
        });
      });
    };

    const update = () => {
      // Allow drawing for VICTORY state too (for fireworks)
      if (gameState !== 'PLAYING' && gameState !== 'PAUSED' && gameState !== 'VICTORY') return;

      if (gameState === 'PAUSED') {
        animationFrameId.current = requestAnimationFrame(update);
        return;
      }
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Update and Draw Confetti Particles
      particles.current = particles.current.filter(p => p.life > 0);
      particles.current.forEach(p => {
        p.x += p.dx;
        p.y += p.dy;
        p.dy += 0.1; // gravity
        p.dx *= 0.99; // friction
        p.rotation += p.rotationSpeed;
        p.life -= p.decay;
        
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        // Flutter effect: change scale based on rotation
        const scaleX = Math.cos(p.rotation * 0.05);
        ctx.fillRect(-p.size/2 * scaleX, -p.size/2, p.size * scaleX, p.size);
        ctx.restore();
      });
      ctx.globalAlpha = 1.0;

      if (gameState === 'VICTORY') {
        if (Math.random() < 0.15) { // More frequent
          createConfetti(Math.random() * canvas.width, -20);
        }
        animationFrameId.current = requestAnimationFrame(update);
        return;
      }
      
      // Draw minimal grid
      ctx.strokeStyle = '#f4f4f5'; // Zinc-100
      ctx.lineWidth = 1;
      for(let i=0; i<canvas.width; i+=40) {
        ctx.beginPath();
        ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
      }
      for(let i=0; i<canvas.height; i+=40) {
        ctx.beginPath();
        ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
      }

      // Update paddle position based on keyboard input
      if (keys.current.left && paddle.current.x > 0) {
        paddle.current.x -= PADDLE_SPEED;
      }
      if (keys.current.right && paddle.current.x < canvas.width - PADDLE_WIDTH) {
        paddle.current.x += PADDLE_SPEED;
      }

      drawBricks();
      drawBall();
      drawPaddle();
      
      // Draw Countdown on Canvas
      if (countdownRef.current !== null && countdownRef.current > 0) {
        ctx.font = "bold 80px sans-serif";
        ctx.fillStyle = "rgba(37, 99, 235, 0.8)"; 
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(countdownRef.current.toString(), canvas.width / 2, canvas.height / 2 + 50);
      }

      if (countdownRef.current !== null) {
        animationFrameId.current = requestAnimationFrame(update);
        return;
      }

      // Collision detection
      let activeBricks = 0;
      bricks.current.forEach((column) => {
        column.forEach((brick: any) => {
          if (brick.status === 1) {
            activeBricks++;
            if (
              ball.current.x > brick.x &&
              ball.current.x < brick.x + brick.width &&
              ball.current.y > brick.y &&
              ball.current.y < brick.y + BRICK_HEIGHT
            ) {
              ball.current.dy = -ball.current.dy;
              brick.status = 0;
              setScore(s => s + 10);
              playHitSound();

              // Special Victory Condition: 3 Light Red Bricks
              if (brick.color === '#fca5a5') {
                setRedBricksRemoved(prev => {
                  const newCount = prev + 1;
                  if (newCount >= 3) setGameState('VICTORY');
                  return newCount;
                });
              }
            }
          }
        });
      });

      if (activeBricks === 0) setGameState('VICTORY');

      // Wall collisions
      if (ball.current.x + ball.current.dx > canvas.width - BALL_RADIUS || ball.current.x + ball.current.dx < BALL_RADIUS) {
        ball.current.dx = -ball.current.dx;
      }
      if (ball.current.y + ball.current.dy < BALL_RADIUS) {
        ball.current.dy = -ball.current.dy;
      } else if (ball.current.y + ball.current.dy > canvas.height - BALL_RADIUS - 15) {
        if (ball.current.x > paddle.current.x && ball.current.x < paddle.current.x + PADDLE_WIDTH) {
          const hitPos = (ball.current.x - (paddle.current.x + PADDLE_WIDTH / 2)) / (PADDLE_WIDTH / 2);
          ball.current.dx = hitPos * 5;
          ball.current.dy = -Math.abs(ball.current.dy);
        } else {
          if (lives > 1) {
            setLives(l => l - 1);
            ball.current.x = canvas.width / 2;
            ball.current.y = canvas.height - 40;
            ball.current.dx = 3;
            ball.current.dy = -3;
            paddle.current.x = (canvas.width - PADDLE_WIDTH) / 2;
          } else {
            setGameState('GAMEOVER');
          }
        }
      }

      ball.current.x += ball.current.dx;
      ball.current.y += ball.current.dy;

      animationFrameId.current = requestAnimationFrame(update);
    };

    if (gameState === 'PLAYING' || gameState === 'VICTORY') {
      if (gameState === 'PLAYING') {
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        canvas.addEventListener('touchstart', handleTouch, { passive: false });
        canvas.addEventListener('touchmove', handleTouch, { passive: false });
      }
      animationFrameId.current = requestAnimationFrame(update);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      canvas.removeEventListener('touchstart', handleTouch);
      canvas.removeEventListener('touchmove', handleTouch);
      cancelAnimationFrame(animationFrameId.current);
    };
  }, [gameState, lives]);

  return (
    <div className="relative flex flex-col items-center bg-white text-zinc-900 font-sans h-screen overflow-hidden overflow-y-auto sm:overflow-hidden sm:justify-center">
      <div className="z-10 flex flex-col items-center gap-2 sm:gap-4 w-full max-w-4xl px-2 sm:px-4 h-full sm:h-auto">
        {/* Compact Responsive Header */}
        <div className="w-full grid grid-cols-3 items-center py-2 sm:py-4 border-b border-zinc-100 mb-1 sm:mb-4 bg-white/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex flex-col items-start gap-0.5 sm:gap-1">
            <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-zinc-400">Mission</span>
            <span className="text-lg sm:text-2xl font-black tabular-nums text-zinc-900">{redBricksRemoved} / 3</span>
          </div>
          
          <div className="flex flex-col items-center">
            <h1 className="text-sm sm:text-2xl font-black tracking-tight uppercase flex items-center gap-1 sm:gap-3">
              <span className="hidden sm:inline text-blue-600 bg-blue-50 px-2 py-0.5 rounded text-xs tracking-normal">INU</span>
              <span className="truncate max-w-[80px] sm:max-w-none">{playerName || 'Breakout'}</span>
            </h1>
            <div className="flex flex-col items-center">
              <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-zinc-400">Time</span>
              <span className="text-xs sm:text-lg font-bold tabular-nums text-blue-600">{formatTime(time)}</span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-0.5 sm:gap-1">
            <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-zinc-400">Lives</span>
            <div className="flex gap-1 sm:gap-1.5 mt-0.5">
              {[...Array(3)].map((_, i) => (
                <div key={i} className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${i < lives ? 'bg-blue-600' : 'bg-zinc-100'}`} />
              ))}
            </div>
          </div>
        </div>

        {/* Pause Button (External to header for better mobile tap) */}
        {gameState === 'PLAYING' && (
          <button 
            onClick={() => setGameState('PAUSED')}
            className="fixed bottom-6 right-6 z-30 w-12 h-12 bg-zinc-900 text-white rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-all sm:static sm:w-auto sm:h-auto sm:px-4 sm:py-1.5 sm:bg-zinc-900 sm:rounded-full sm:mb-4 sm:shadow-lg sm:shadow-zinc-200"
          >
            <div className="flex gap-1 sm:gap-0.5">
              <div className="w-1 h-3.5 sm:h-2.5 bg-white rounded-full"></div>
              <div className="w-1 h-3.5 sm:h-2.5 bg-white rounded-full"></div>
            </div>
            <span className="hidden sm:inline ml-2 text-[10px] font-bold uppercase tracking-widest">PAUSE</span>
          </button>
        )}

        {/* Canvas Area - Dynamic Height for Mobile */}
        <div className="relative w-full max-w-[800px] aspect-[4/3] rounded-2xl overflow-hidden border border-zinc-100 soft-shadow bg-zinc-50/50 flex-shrink min-h-0">
          <canvas 
            ref={canvasRef}
            width={800}
            height={600}
            className="w-full h-full block cursor-none touch-none"
          />

          {gameState !== 'PLAYING' && (
            <div className={`absolute inset-0 flex flex-col items-center justify-center ${gameState === 'VICTORY' ? 'bg-white/10' : 'bg-white/95'} ${gameState === 'VICTORY' ? '' : 'backdrop-blur-md'} transition-all duration-700 z-40 p-4`}>
              <div className="text-center w-full max-w-sm mx-auto flex flex-col items-center">
                {gameState === 'IDLE' && (
                  <>
                    <div className="flex justify-center mb-2 sm:mb-6 select-none">
                      <img 
                        src="/hwetbul.png" 
                        alt="횃불이" 
                        className="w-16 h-16 sm:w-32 sm:h-32 object-contain animate-bounce-slow"
                      />
                    </div>
                    <h2 className="text-xl sm:text-3xl font-black mb-0.5 sm:mb-1">INU Breakout</h2>
                    <p className="text-zinc-500 mb-4 sm:mb-8 text-[10px] sm:text-sm">
                      Enter your name to start the mission.
                    </p>
                    
                    <div className="space-y-3 sm:space-y-4 w-full">
                      <div className="text-left">
                        <label className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wider text-zinc-400 ml-1">Player Name</label>
                        <input 
                          type="text" 
                          value={playerName}
                          onChange={(e) => setPlayerName(e.target.value)}
                          placeholder="Your Name"
                          className="w-full mt-0.5 sm:mt-1 px-4 py-2 sm:py-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium text-sm"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && playerName.trim()) startGame();
                          }}
                        />
                      </div>
                      
                      <button 
                        onClick={startGame}
                        disabled={!playerName.trim()}
                        className="w-full py-3 sm:py-4 bg-zinc-900 text-white rounded-xl font-bold hover:bg-zinc-800 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none shadow-xl shadow-zinc-200 text-sm sm:text-base"
                      >
                        LAUNCH MISSION
                      </button>
                    </div>

                    <div className="mt-4 sm:mt-8 pt-3 sm:pt-6 border-t border-zinc-100 w-full">
                      <p className="text-[8px] sm:text-[11px] font-bold text-zinc-300 tracking-widest uppercase">Developer Info</p>
                      <p className="text-zinc-400 font-medium text-[10px] sm:text-sm mt-0.5">경영학부 202601606 양지원</p>
                    </div>
                  </>
                )}
                {gameState === 'PAUSED' && (
                  <>
                    <div className="mb-4 sm:mb-8">
                      <div className="w-12 h-12 sm:w-16 sm:h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-2 sm:mb-4">
                        <div className="flex gap-1 sm:gap-1.5">
                          <div className="w-1.5 h-4 sm:h-6 bg-blue-600 rounded-full"></div>
                          <div className="w-1.5 h-4 sm:h-6 bg-blue-600 rounded-full"></div>
                        </div>
                      </div>
                      <h2 className="text-2xl sm:text-3xl font-black mb-1 sm:mb-2">PAUSED</h2>
                      <p className="text-zinc-500 text-[10px] sm:text-sm italic">Take a breath, {playerName}!</p>
                    </div>
                    <div className="space-y-2 sm:space-y-3 w-full">
                      <button 
                        onClick={() => setGameState('PLAYING')}
                        className="w-full py-3 sm:py-4 bg-blue-600 text-white rounded-xl font-bold text-sm sm:text-base hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
                      >
                        RESUME (재개)
                      </button>
                      <button 
                        onClick={startGame}
                        className="w-full py-3 sm:py-4 bg-zinc-900 text-white rounded-xl font-bold text-sm sm:text-base hover:bg-zinc-800 transition-all"
                      >
                        RESTART (다시 시작)
                      </button>
                      <button 
                        onClick={() => setGameState('IDLE')}
                        className="w-full py-3 sm:py-4 bg-white border border-zinc-200 text-zinc-900 rounded-xl font-bold text-sm sm:text-base hover:bg-zinc-50 transition-all"
                      >
                        QUIT (종료)
                      </button>
                    </div>
                  </>
                )}
                {gameState === 'GAMEOVER' && (
                  <>
                    <h2 className="text-3xl sm:text-4xl font-black text-red-500 mb-2">미션 실패!</h2>
                    <p className="text-zinc-500 mb-6 sm:mb-8 text-sm">안타깝네요. {playerName}님,<br/>다시 도전해보시겠어요?</p>
                    <div className="space-y-2 sm:space-y-3 w-full">
                      <button 
                        onClick={startGame}
                        className="w-full py-3 sm:py-4 bg-red-600 text-white rounded-xl font-bold text-sm sm:text-base hover:bg-red-700 transition-all"
                      >
                        다시 시작하기
                      </button>
                      <button 
                        onClick={() => setGameState('IDLE')}
                        className="w-full py-3 sm:py-4 bg-white border border-zinc-200 text-zinc-900 rounded-xl font-bold text-sm sm:text-base hover:bg-zinc-50 transition-all"
                      >
                        메인으로
                      </button>
                    </div>
                  </>
                )}
                {gameState === 'VICTORY' && (
                  <>
                    <h2 className="text-4xl font-black text-blue-600 mb-2">미션 클리어!</h2>
                    <div className="mb-8">
                      <p className="text-zinc-500">대단해요! {playerName}님,<br />빨간색 블록 3개를 모두 제거했습니다!</p>
                      <div className="mt-4 inline-flex items-center gap-4 px-6 py-2 bg-blue-50 rounded-full border border-blue-100">
                        <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Clear Time</span>
                        <span className="text-xl font-black text-blue-600">{formatTime(time)}</span>
                      </div>
                    </div>

                    {/* Top 3 Leaderboard */}
                    {leaderboard.length > 0 && (
                      <div className="w-full mb-8 space-y-2 bg-zinc-50 rounded-2xl p-6 border border-zinc-100">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Top 3 Players</h3>
                          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                        </div>
                        <div className="space-y-3">
                          {leaderboard.map((entry, i) => (
                            <div key={i} className="flex items-center justify-between group">
                              <div className="flex items-center gap-3">
                                <span className={`w-6 h-6 flex items-center justify-center rounded-lg text-[10px] font-black ${
                                  i === 0 ? 'bg-amber-100 text-amber-600' : 
                                  i === 1 ? 'bg-zinc-200 text-zinc-600' : 
                                  'bg-orange-100 text-orange-600'
                                }`}>
                                  {i + 1}
                                </span>
                                <span className="font-bold text-zinc-800">{entry.name}</span>
                              </div>
                              <span className="text-sm font-black text-zinc-400 group-hover:text-blue-600 transition-colors uppercase tracking-wider">{entry.time}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <button 
                      onClick={() => setGameState('IDLE')}
                      className="w-full py-4 bg-zinc-900 text-white rounded-xl font-bold hover:bg-zinc-800 transition-all"
                    >
                      다시 도전
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="flex flex-wrap justify-center gap-x-8 gap-y-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-4">
          <div className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 rounded border border-zinc-200 bg-white shadow-sm font-sans">←</kbd>
            <kbd className="px-1.5 py-0.5 rounded border border-zinc-200 bg-white shadow-sm font-sans">→</kbd>
            <span className="hidden sm:inline">TO MOVE</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded border border-zinc-200 bg-white shadow-sm font-sans">SWIPE</span>
            <span className="sm:hidden">TO MOVE</span>
          </div>
          <span className="hidden sm:inline w-1 h-1 rounded-full bg-zinc-200 mt-1.5"></span>
          <span>Clear All Bricks</span>
        </div>
      </div>
    </div>
  );
}
