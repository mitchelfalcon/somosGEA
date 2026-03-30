# GEA Interactive Voice Form (Observatorio de Violencia de Género)

An interactive, voice-enabled research form designed for the Gender Equality Observatory (GEA). This application facilitates the collection of critical data regarding gender-based violence and femicide in Mexico, aiming to generate knowledge for effective public policies. 

The application is based on the methodology of the European Institute for Gender Equality (EIGE), adapted for the Mexican context.

## ✨ Key Features

* **🗣️ Voice User Interface (VUI):** 
  * **Text-to-Speech (TTS):** Automatically reads questions aloud to the user using the browser's native Speech Synthesis API.
  * **Active Listening & Silence Detection:** The microphone automatically activates after a question is read and stops recording when it detects a period of silence, providing a seamless hands-free experience.
* **🧠 AI-Powered Intent Recognition:** Integrates the **Google Gemini API** to process audio recordings, transcribe speech to text, and intelligently map the user's natural language responses to the exact available form options.
* **✅ Strict Validation & Error Handling:** Ensures data integrity by strictly validating voice inputs against allowed options. If a response is ambiguous, the system prompts the user to repeat or select manually.
* **👆 Manual Fallback:** Users can seamlessly switch between voice input and manual button clicks at any point during the survey.
* **📄 Export to PDF & TXT:** Upon completion, users can download a comprehensive summary report of their answers in either plain text (`.txt`) or a professionally formatted PDF (`.pdf`).
* **🎨 Modern, Accessible UI:** Features a soft, professional color palette (pinks, purples, rose gold), glassmorphism effects, and smooth animations using Tailwind CSS.

## 🛠️ Technologies Used

* **Frontend:** React 19, Vite, Tailwind CSS
* **Icons:** Lucide React
* **AI & Voice Processing:** `@google/genai` (Gemini 3.1 Flash Preview)
* **Audio APIs:** Web Speech API (`SpeechSynthesis`), `MediaRecorder` API, `AudioContext` (for silence detection)
* **Document Generation:** `jspdf`, `jspdf-autotable`

## 🚀 Getting Started

### Prerequisites

* Node.js (v18 or higher)
* A Google Gemini API Key

### Installation

1. Clone the repository and navigate to the project directory.
2. Install the dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the root directory and add your Gemini API key:
   ```env
   GEMINI_API_KEY=your_api_key_here
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

## 📁 Project Structure

* `src/App.tsx`: The main application component containing the state machine for the form, audio processing logic, Gemini API integration, and the UI rendering.
* `src/index.css`: Global stylesheet including Tailwind CSS directives and custom animations.
* `metadata.json`: Contains application metadata and requests necessary browser permissions (e.g., `microphone`).

## 🔒 Privacy & Permissions

This application requires **Microphone** access to function correctly in voice mode. Audio data is temporarily recorded and sent securely to the Google Gemini API for transcription and intent recognition. No audio is permanently stored on the client device.

## 🤝 Acknowledgments

* **GEA (Observatorio de Violencia de Género)** for the domain context and branding.
* **EIGE (European Institute for Gender Equality)** for the foundational research methodology.
