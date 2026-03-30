import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, Play, Square, CheckCircle, AlertCircle, ChevronRight, RefreshCw, Download, FileText, FileDown } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- TIPOS Y DATOS DEL FORMULARIO ---

type QuestionType = 'info' | 'choice' | 'boolean';

interface Step {
  id: string;
  text: string;
  type: QuestionType;
  options?: string[];
  block?: string;
}

const formSteps: Step[] = [
  {
    id: 'intro',
    type: 'info',
    text: "Hola. Te damos la bienvenida al Formulario de Investigación Interactivo de GEA. Este sistema facilita la recolección de datos sobre violencia de género y feminicidio en México. Nuestro objetivo es generar conocimiento para políticas públicas efectivas. Te haré unas preguntas. Puedes responder hablando al micrófono o usando los botones. ¿Comenzamos?",
  },
  {
    id: 'q1_tipo',
    block: 'Bloque 1: Tipo de Homicidio',
    type: 'choice',
    text: "Para comenzar, ¿El caso registrado corresponde a un homicidio intencional cometido por la pareja íntima o un familiar?",
    options: ["Sí", "No", "No disponible", "No aplica"]
  },
  {
    id: 'q2_victima',
    block: 'Bloque 2: Características de la Víctima',
    type: 'choice',
    text: "Entendido. Sobre la víctima, ¿Se tiene registro de alguna condición de vulnerabilidad específica, como embarazo, discapacidad o pertenencia a un grupo étnico?",
    options: ["Sí, registrada", "No registrada", "Parcialmente", "No aplica"]
  },
  {
    id: 'q3_perpetrador',
    block: 'Bloque 3: Características del Perpetrador',
    type: 'choice',
    text: "Gracias. En cuanto al perpetrador, ¿Existe un historial previo de violencia contra mujeres registrado oficial o extraoficialmente?",
    options: ["Sí, con historial", "No hay historial", "No disponible", "No aplica"]
  },
  {
    id: 'q4_circunstancias',
    block: 'Bloque 5: Circunstancias',
    type: 'choice',
    text: "Tomando nota. ¿El suceso involucró indicadores de violencia sexualizada, explotación o lesiones degradantes?",
    options: ["Sí", "No", "No disponible", "No aplica"]
  },
  {
    id: 'q5_institucional',
    block: 'Bloque 7: Mecanismos Institucionales',
    type: 'choice',
    text: "Finalmente, a nivel institucional en la región del caso: ¿Existe una ley o un organismo gubernamental dedicado exclusivamente a la igualdad de género?",
    options: ["Sí existe", "No existe", "No se sabe", "No aplica"]
  },
  {
    id: 'outro',
    type: 'info',
    text: "Hemos terminado. Gracias por tu colaboración. Estos datos son fundamentales para visibilizar la problemática y fortalecer las estrategias de prevención en México. Generando reporte...",
  }
];

// --- COMPONENTE PRINCIPAL ---

export default function App() {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [transcript, setTranscript] = useState('');
  const [voiceError, setVoiceError] = useState('');
  const [speechSupported, setSpeechSupported] = useState(true);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const currentStep = formSteps[currentStepIndex];
  const isFinished = currentStepIndex >= formSteps.length;

  // Inicializar TTS y verificar soporte de micrófono
  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setSpeechSupported(false);
      }
    }
    
    return () => {
      if (synthRef.current) synthRef.current.cancel();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(console.error);
      }
    };
  }, []);

  // Leer la pregunta actual al cambiar de paso
  useEffect(() => {
    if (!isFinished && currentStep) {
      speakText(currentStep.text);
    }
  }, [currentStepIndex]);

  const speakText = (text: string) => {
    if (!synthRef.current) return;
    synthRef.current.cancel(); // Detener cualquier habla anterior

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-MX';
    utterance.rate = 0.95; // Un poco más lento para ser didáctico
    utterance.pitch = 1;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      // Auto-iniciar escucha si seguimos en el mismo paso y no ha terminado
      if (!isFinished && currentStep && currentStep.text === text) {
        startListening();
      }
    };

    synthRef.current.speak(utterance);
  };

  const processAudioWithGemini = async (audioBlob: Blob, mimeType: string, step: Step) => {
    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);
    reader.onloadend = async () => {
      try {
        const base64data = (reader.result as string).split(',')[1];
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        
        const optionsText = step.options 
          ? `Las opciones disponibles son EXACTAMENTE: ${step.options.map(o => `"${o}"`).join(', ')}.` 
          : 'Este es un paso informativo, solo verifica si el usuario quiere continuar (ej. "sí", "comenzar", "ok", "continuar").';
        
        const prompt = `Eres un asistente útil procesando entrada de voz para un formulario en español. 
El usuario está respondiendo a la siguiente pregunta: "${step.text}".
${optionsText}
Transcribe el audio con precisión en español en el campo 'transcript'. 
Analiza la intención del usuario. Si coincide con una de las opciones, devuelve EXACTAMENTE la cadena de la opción en 'selectedOption'.
Si es un paso informativo y aceptan continuar, establece 'selectedOption' como 'continuar'.
Si la respuesta es ambigua, no tiene sentido, o no coincide con las opciones, establece 'selectedOption' como null.`;

        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [
            {
              inlineData: {
                data: base64data,
                mimeType: mimeType
              }
            },
            prompt
          ],
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                transcript: { 
                  type: Type.STRING,
                  description: "El texto transcrito del audio en español."
                },
                selectedOption: { 
                  type: Type.STRING,
                  description: "La opción exactamente coincidente, 'continuar', o null."
                }
              }
            }
          }
        });

        if (response.text) {
          const result = JSON.parse(response.text);
          setTranscript(result.transcript);
          
          let isValid = false;
          if (step.type === 'info' && result.selectedOption === 'continuar') {
            isValid = true;
          } else if (step.options && result.selectedOption && step.options.includes(result.selectedOption)) {
            isValid = true;
          }

          if (isValid) {
            setVoiceError('');
            if (step.type === 'info') {
              setTimeout(handleNext, 1500);
            } else {
              setTimeout(() => handleAnswer(result.selectedOption), 1500);
            }
          } else {
            const errorMsg = "No se reconoció una opción válida. Por favor, repite o selecciona manualmente.";
            setVoiceError(errorMsg);
            speakText(errorMsg);
          }
        }
      } catch (error) {
        console.error("Error de la API de Gemini:", error);
        setTranscript("Hubo un error al procesar el audio con Gemini.");
      } finally {
        setIsProcessing(false);
      }
    };
  };

  const startListening = async () => {
    if (isListening || isProcessing) return;
    
    setTranscript('');
    setVoiceError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      // Capturamos el step actual para evitar stale closures
      const stepAtRecording = currentStep;

      mediaRecorder.onstop = async () => {
        setIsListening(false);
        setIsProcessing(true);
        stream.getTracks().forEach(track => track.stop());
        
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close().catch(console.error);
        }
        
        const mimeType = mediaRecorder.mimeType.split(';')[0] || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        await processAudioWithGemini(audioBlob, mimeType, stepAtRecording);
      };

      mediaRecorder.start();
      setIsListening(true);
      
      // Si estaba hablando, lo detenemos para escuchar
      if (isSpeaking && synthRef.current) {
        synthRef.current.cancel();
        setIsSpeaking(false);
      }

      // --- Detección de Silencio para Auto-Detener ---
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      let lastSpeechTime = Date.now();
      let hasSpoken = false;

      const detectSilence = () => {
        if (mediaRecorder.state !== 'recording') return;
        
        analyser.getByteFrequencyData(dataArray);
        const sum = dataArray.reduce((a, b) => a + b, 0);
        const average = sum / bufferLength;
        
        if (average > 15) { // Umbral de voz
          lastSpeechTime = Date.now();
          hasSpoken = true;
        } else {
          const silenceDuration = Date.now() - lastSpeechTime;
          if (hasSpoken && silenceDuration > 2000) {
            // 2 segundos de silencio después de hablar -> detener
            mediaRecorder.stop();
            return;
          } else if (!hasSpoken && silenceDuration > 8000) {
            // 8 segundos de silencio absoluto -> detener
            mediaRecorder.stop();
            return;
          }
        }
        animationFrameRef.current = requestAnimationFrame(detectSilence);
      };
      
      detectSilence();

    } catch (e) {
      console.error("Error al acceder al micrófono:", e);
      setSpeechSupported(false);
    }
  };

  const stopListening = () => {
    if (isListening && mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleAnswer = (answer: string) => {
    setAnswers(prev => ({ ...prev, [currentStep.id]: answer }));
    if (isListening) mediaRecorderRef.current?.stop();
    handleNext();
  };

  const handleNext = () => {
    setTranscript('');
    setVoiceError('');
    setCurrentStepIndex(prev => prev + 1);
  };

  const restartForm = () => {
    setAnswers({});
    setCurrentStepIndex(0);
    setTranscript('');
    setVoiceError('');
  };

  const downloadReport = () => {
    let reportContent = "Reporte de Investigación - Observatorio de Violencia de Género (GEA)\n";
    reportContent += `Fecha de generación: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}\n`;
    reportContent += "====================================================================\n\n";

    formSteps.filter(s => s.type !== 'info').forEach(step => {
      const answer = answers[step.id] || 'Sin respuesta';
      reportContent += `[${step.block || 'Pregunta'}]\n`;
      reportContent += `Pregunta: ${step.text}\n`;
      reportContent += `Respuesta: ${answer}\n\n`;
    });

    reportContent += "====================================================================\n";
    reportContent += "Fin del reporte.\n";

    const blob = new Blob([reportContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reporte_GEA_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadPDFReport = () => {
    const doc = new jsPDF();
    
    // Título y Encabezado
    doc.setFontSize(18);
    doc.setTextColor(142, 107, 136); // #8e6b88
    doc.text("Reporte de Investigación", 14, 22);
    
    doc.setFontSize(14);
    doc.setTextColor(184, 134, 171); // #b886ab
    doc.text("Observatorio de Violencia de Género (GEA)", 14, 30);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Fecha de generación: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 14, 38);
    
    // Preparar datos para la tabla
    const tableData = formSteps.filter(s => s.type !== 'info').map(step => [
      step.block || 'Pregunta',
      step.text,
      answers[step.id] || 'Sin respuesta'
    ]);

    // Generar tabla
    autoTable(doc, {
      startY: 45,
      head: [['Bloque', 'Pregunta', 'Respuesta']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [212, 165, 201], textColor: 255 }, // #d4a5c9
      styles: { fontSize: 10, cellPadding: 4, textColor: [90, 74, 88] },
      columnStyles: {
        0: { cellWidth: 40, fontStyle: 'bold' },
        1: { cellWidth: 90 },
        2: { cellWidth: 'auto', fontStyle: 'bold', textColor: [184, 134, 171] }
      }
    });

    doc.save(`Reporte_GEA_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // --- RENDERIZADO ---

  if (isFinished) {
    return (
      <div className="min-h-screen bg-[#fdf5f7] flex flex-col items-center justify-center p-6 font-sans">
        <div className="max-w-2xl w-full bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl p-8 border-t-8 border-[#d4a5c9]">
          <div className="flex items-center justify-center mb-6">
            <CheckCircle size={64} className="text-[#d4a5c9] mb-4" />
          </div>
          <h1 className="text-3xl font-bold text-center text-[#8e6b88] mb-2">Investigación Completada</h1>
          <p className="text-center text-[#a88b9f] mb-8">
            Los datos han sido registrados exitosamente en el sistema de GEA.
          </p>
          
          <div className="bg-[#fcf0f4] rounded-2xl p-6 mb-8 border border-[#f3d9e4]">
            <h2 className="text-lg font-semibold text-[#8e6b88] mb-4 border-b border-[#f3d9e4] pb-2">Resumen de Datos Recopilados</h2>
            <ul className="space-y-3">
              {formSteps.filter(s => s.type !== 'info').map(step => (
                <li key={step.id} className="flex flex-col sm:flex-row sm:justify-between border-b border-[#f3d9e4] pb-2 last:border-0">
                  <span className="text-sm text-[#8e6b88] font-medium">{step.block}</span>
                  <span className="text-sm text-[#b886ab] font-bold bg-white px-3 py-1 rounded-full mt-1 sm:mt-0 w-fit shadow-sm">
                    {answers[step.id] || 'Sin respuesta'}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <button 
                onClick={downloadPDFReport}
                className="flex-1 flex items-center justify-center gap-2 bg-[#8e6b88] text-white hover:bg-[#7a5a74] py-4 rounded-2xl font-semibold transition-all shadow-sm hover:shadow-md"
              >
                <FileDown size={20} />
                Descargar PDF
              </button>
              <button 
                onClick={downloadReport}
                className="flex-1 flex items-center justify-center gap-2 bg-white text-[#8e6b88] border-2 border-[#d4a5c9] hover:bg-[#fcf0f4] py-4 rounded-2xl font-semibold transition-all shadow-sm hover:shadow-md"
              >
                <FileText size={20} />
                Descargar TXT
              </button>
            </div>
            <button 
              onClick={restartForm}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#d4a5c9] to-[#e6b8c9] hover:from-[#c293b7] hover:to-[#d4a5c9] text-white py-4 rounded-2xl font-semibold transition-all shadow-md hover:shadow-lg"
            >
              <RefreshCw size={20} />
              Nuevo Registro
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#fcf0f4] via-[#fdf5f7] to-[#f8e6ed] flex flex-col items-center justify-center p-4 sm:p-6 font-sans relative overflow-hidden">
      
      {/* Decorative background elements */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-[#f3d9e4] rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob"></div>
      <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-[#e6b8c9] rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-2000"></div>
      <div className="absolute bottom-[-20%] left-[20%] w-96 h-96 bg-[#d4a5c9] rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>

      {/* Header GEA */}
      <div className="absolute top-6 left-6 flex items-center gap-4 z-10">
        <div className="w-24 h-16 rounded-2xl flex items-center justify-center shadow-lg bg-white/50 backdrop-blur-md border border-white/40 overflow-hidden p-2">
           <img src="https://storage.googleapis.com/aistudio-user-content/0-1743349942971-image.png" alt="GEA Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
        </div>
        <div className="hidden sm:block">
          <h2 className="text-[#8e6b88] font-bold leading-tight text-lg">Observatorio de</h2>
          <p className="text-[#b886ab] text-sm font-medium">Violencia de Género</p>
        </div>
      </div>

      <div className="max-w-3xl w-full bg-white/80 backdrop-blur-xl rounded-[2rem] shadow-2xl overflow-hidden border border-white/50 z-10 relative">
        
        {/* Barra de progreso */}
        <div className="w-full bg-[#f3d9e4]/50 h-2">
          <div 
            className="bg-gradient-to-r from-[#d4a5c9] to-[#e6b8c9] h-2 transition-all duration-500 ease-out"
            style={{ width: `${(currentStepIndex / (formSteps.length - 1)) * 100}%` }}
          ></div>
        </div>

        <div className="p-8 sm:p-12">
          {/* Indicador de Bloque */}
          {currentStep.block && (
            <div className="inline-block bg-[#fcf0f4] text-[#b886ab] text-xs font-bold px-4 py-1.5 rounded-full mb-8 uppercase tracking-wider border border-[#f3d9e4]">
              {currentStep.block}
            </div>
          )}

          {/* Texto de la Pregunta / Info */}
          <div className="relative mb-12">
            <h2 className="text-2xl sm:text-3xl font-medium text-[#5a4a58] leading-relaxed">
              {currentStep.text}
            </h2>
            
            {/* Indicador visual de que está hablando */}
            {isSpeaking && (
              <div className="absolute -left-8 top-3 flex flex-col gap-1.5">
                <span className="w-2 h-2 bg-[#d4a5c9] rounded-full animate-ping"></span>
                <span className="w-2 h-2 bg-[#e6b8c9] rounded-full animate-ping" style={{ animationDelay: '0.2s' }}></span>
                <span className="w-2 h-2 bg-[#d4a5c9] rounded-full animate-ping" style={{ animationDelay: '0.4s' }}></span>
              </div>
            )}
          </div>

          {/* Controles de Voz */}
          <div className="flex flex-col items-center justify-center mb-12">
            <div className="relative">
              {/* Glow effect behind button */}
              <div className={`absolute inset-0 rounded-full blur-xl transition-all duration-500 ${
                isListening ? 'bg-[#ff8fa3] opacity-60 scale-150' : 
                isProcessing ? 'bg-[#ffd166] opacity-40 scale-125' : 
                'bg-[#d4a5c9] opacity-40 scale-110'
              }`}></div>
              
              <button
                onClick={toggleListening}
                disabled={!speechSupported || isProcessing}
                className={`relative group flex items-center justify-center w-28 h-28 rounded-full transition-all duration-300 shadow-xl border-4 border-white/50 ${
                  isListening 
                    ? 'bg-gradient-to-br from-[#ff8fa3] to-[#ff4d6d] hover:scale-105' 
                    : isProcessing
                    ? 'bg-gradient-to-br from-[#ffd166] to-[#ffb703] cursor-wait'
                    : 'bg-gradient-to-br from-[#d4a5c9] to-[#c293b7] hover:scale-105'
                } ${(!speechSupported) && 'opacity-50 cursor-not-allowed'}`}
              >
                {isListening ? (
                  <>
                    <span className="absolute inset-0 rounded-full bg-white/20 animate-ping"></span>
                    <Square className="text-white relative z-10" size={36} fill="currentColor" />
                  </>
                ) : isProcessing ? (
                  <RefreshCw className="text-white animate-spin" size={36} />
                ) : (
                  <Mic className="text-white" size={44} />
                )}
              </button>
            </div>
            <p className="mt-6 text-sm font-medium text-[#a88b9f]">
              {isListening ? 'Escuchando activamente... (se detendrá al terminar de hablar)' : isProcessing ? 'Procesando con IA...' : 'Toca el micrófono para hablar'}
            </p>
            
            {/* Transcripción en vivo */}
            {transcript && (
              <div className="mt-6 px-8 py-4 bg-white/60 backdrop-blur-sm rounded-2xl border border-[#f3d9e4] w-full text-center italic text-[#8e6b88] shadow-sm">
                "{transcript}"
              </div>
            )}

            {/* Error de validación de voz */}
            {voiceError && (
              <div className="mt-4 px-6 py-3 bg-[#fff0f0] rounded-2xl border border-[#ffcdd2] w-full text-center text-[#d32f2f] shadow-sm flex items-center justify-center gap-2 animate-in fade-in slide-in-from-bottom-2">
                <AlertCircle size={18} />
                <span className="text-sm font-medium">{voiceError}</span>
              </div>
            )}
          </div>

          {/* Opciones Manuales (Fallback / Alternativa) */}
          <div className="space-y-4">
            {currentStep.type === 'info' ? (
              <button
                onClick={handleNext}
                className="w-full flex items-center justify-center gap-2 bg-[#fcf0f4] hover:bg-[#f3d9e4] text-[#8e6b88] py-5 rounded-2xl font-semibold transition-all border border-[#f3d9e4] hover:shadow-md"
              >
                Continuar <ChevronRight size={20} />
              </button>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {currentStep.options?.map((opt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAnswer(opt)}
                    className="flex items-center justify-center py-5 px-6 bg-white border-2 border-[#f3d9e4] hover:border-[#d4a5c9] hover:bg-[#fcf0f4] text-[#8e6b88] rounded-2xl font-medium transition-all shadow-sm hover:shadow-md"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>

        </div>
        
        {/* Footer info */}
        <div className="bg-white/40 backdrop-blur-md p-5 flex items-center justify-between border-t border-[#f3d9e4]/50">
          <div className="flex items-center gap-2 text-xs font-medium text-[#a88b9f]">
            <Volume2 size={16} className={isSpeaking ? 'text-[#d4a5c9]' : ''} />
            {isSpeaking ? 'Asistente hablando...' : 'Asistente en espera'}
          </div>
          {!speechSupported && (
            <div className="flex items-center gap-1.5 text-xs text-[#ff8fa3] font-medium bg-[#ff8fa3]/10 px-3 py-1.5 rounded-full">
              <AlertCircle size={14} />
              Micrófono no soportado
            </div>
          )}
        </div>
      </div>
      
      <p className="mt-8 text-center text-xs text-[#b886ab] max-w-lg z-10 font-medium tracking-wide">
        Basado en la metodología del Instituto Europeo para la Igualdad de Género (EIGE) adaptada para México.
      </p>
    </div>
  );
}
