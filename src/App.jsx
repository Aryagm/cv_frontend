import React, { useRef, useState, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';

const App = () => {
  const webcamRef = useRef(null);
  const [alerts, setAlerts] = useState([]);
  const [processedImage, setProcessedImage] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [hapticEnabled, setHapticEnabled] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [voiceActivated, setVoiceActivated] = useState(false);
  const [listeningStatus, setListeningStatus] = useState('');
  const recognitionRef = useRef(null);
  const [sidewalkAlertsEnabled, setSidewalkAlertsEnabled] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Performance configuration variables
  const processingInterval = 300; // 1 second between frame captures
  const imageQuality = 0.8; // JPEG quality (0-1)
  const maxImageWidth = 1200; // Maximum width for processed images
  
  // Refs for performance optimization
  const lastUtteranceRef = useRef(Date.now());
  const minTimeBetweenUtterances = 3000; // 3 seconds between audio alerts

  const enableAudio = () => {
    // Force the loading of voices (important on iOS)
    const voices = window.speechSynthesis.getVoices();
    console.log('Loaded voices:', voices);
    window.speechSynthesis.resume();
    const dummyUtterance = new SpeechSynthesisUtterance(' ');
    window.speechSynthesis.speak(dummyUtterance);
    setAudioEnabled(true);
  };

  const toggleSidewalkAlerts = () => {
    const newState = !sidewalkAlertsEnabled;
    setSidewalkAlertsEnabled(newState);
    
    // Provide audio feedback if enabled
    if (audioEnabled) {
      const message = newState ? 'Sidewalk alerts enabled' : 'Sidewalk alerts disabled';
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.rate = 1.2;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Check if vibration is supported by the device
  const isVibrationSupported = () => {
    return "vibrate" in navigator;
  };

  // Enable haptic feedback if supported
  const enableHaptic = () => {
    if (isVibrationSupported()) {
      setHapticEnabled(true);
    } else {
      console.log("Vibration not supported on this device");
    }
  };

  // Function to trigger haptic feedback
  const triggerHapticFeedback = (alerts) => {
    if (hapticEnabled && isVibrationSupported()) {
      // Vibrate differently based on number of alerts
      if (alerts.length > 1) {
        // Multiple alerts: pattern of vibrations (in milliseconds)
        navigator.vibrate([100, 50, 100, 50, 100]);
      } else {
        // Single alert: simple vibration
        navigator.vibrate(200);
      }
    }
  };

  const startVoiceRecognition = () => {
    // Check if the browser supports speech recognition
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert("Your browser doesn't support speech recognition. Try Chrome or Edge.");
      return;
    }
  
    // Initialize speech recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true; // Enable interim results for faster response
    recognition.lang = 'en-US';
    
    recognition.onstart = () => {
      setListeningStatus('Listening for voice commands...');
      console.log('Voice recognition started');
    };
    
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript.trim().toLowerCase();
        const isFinal = event.results[i].isFinal;      
        // Fixed syntax error by removing the stray 'x'
        
        console.log(`Heard${isFinal ? ' (final)' : ' (interim)'}: ${transcript} (Confidence: ${event.results[i][0].confidence.toFixed(2)})`);

        setListeningStatus(`Current Detection: "${transcript}"`);
        // Process command if confidence is reasonable or result is final
        if ((isFinal || event.results[i][0].confidence > 0.5) && 
            (transcript.includes('start') || transcript.includes('stop') || transcript.includes('enable') || transcript.includes('disable'))) {
          
          // Visual feedback that command was heard
          setListeningStatus(`Command detected: "${transcript}"`);
          
          if (transcript.includes('start')) {
            startCamera();
            if (audioEnabled) {
              const startMsg = new SpeechSynthesisUtterance('Starting camera');
              startMsg.rate = 1.2; // Slightly faster speech
              window.speechSynthesis.speak(startMsg);
            }
          } 
          else if (transcript.includes('stop')) {
            stopCamera();
            if (audioEnabled) {
              const stopMsg = new SpeechSynthesisUtterance('Stopping camera');
              stopMsg.rate = 1.2; // Slightly faster speech
              window.speechSynthesis.speak(stopMsg);
            }
          }
          else if (transcript.includes('disable') || transcript.includes('turn off sidewalk')) {
            if (sidewalkAlertsEnabled) {
              toggleSidewalkAlerts();
            }
          }
          else if (transcript.includes('enable') || transcript.includes('turn on sidewalk')) {
            if (!sidewalkAlertsEnabled) {
              toggleSidewalkAlerts();
            }
          }
          
          // Reset status after a short delay
          setTimeout(() => {
            if (voiceActivated) {
              setListeningStatus('Listening for voice commands...');
            }
          }, 2000);
          
          break; // Process only one command at a time
        }
      }
    };
    
    // Other voice recognition handlers remain the same
    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setListeningStatus('Voice recognition error: ' + event.error);
      
      // Auto-restart on error after a short delay
      if (event.error === 'network' || event.error === 'no-speech') {
        setTimeout(() => {
          if (voiceActivated && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch (e) {
              console.log("Couldn't restart recognition:", e);
            }
          }
        }, 1000);
      }
    };
    
    recognition.onend = () => {
      // Restart recognition immediately if voice activation is still enabled
      if (voiceActivated) {
        try {
          recognition.start();
        } catch (e) {
          console.log("Couldn't restart recognition:", e);
          // Try again after a short delay
          setTimeout(() => {
            if (voiceActivated) {
              try {
                recognition.start();
              } catch (e) {
                console.log("Still couldn't restart recognition");
              }
            }
          }, 500);
        }
      } else {
        setListeningStatus('');
      }
    };
    
    recognitionRef.current = recognition;
    recognition.start();
    setVoiceActivated(true);
  };

  const stopVoiceRecognition = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setVoiceActivated(false);
    setListeningStatus('');
  };

  const startCamera = () => {
    setIsCameraActive(true);
  };

  const stopCamera = () => {
    setIsCameraActive(false);
  };

  // Function to resize and compress image before sending
  const compressImage = useCallback((imageSrc) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // Calculate new dimensions while maintaining aspect ratio
        let newWidth = img.width;
        let newHeight = img.height;
        
        if (newWidth > maxImageWidth) {
          const scaleFactor = maxImageWidth / newWidth;
          newWidth = maxImageWidth;
          newHeight = img.height * scaleFactor;
        }
        
        // Create canvas for resizing
        const canvas = document.createElement('canvas');
        canvas.width = newWidth;
        canvas.height = newHeight;
        
        // Draw and export with reduced quality
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, newWidth, newHeight);
        resolve(canvas.toDataURL('image/jpeg', imageQuality));
      };
      img.src = imageSrc;
    });
  }, [maxImageWidth]);

  const captureAndProcess = useCallback(async () => {
    if (webcamRef.current && isCameraActive && !isProcessing) {
      setIsProcessing(true);
      
      try {
        const imageSrc = webcamRef.current.getScreenshot();
        if (imageSrc) {
          // Compress image before sending
          const compressedImage = await compressImage(imageSrc);
          
          const response = await fetch('https://o5ejhs-ip-34-133-109-217.tunnelmole.net/process_frame/', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ image: compressedImage })
          });
          
          const data = await response.json();
          
          // Filter out sidewalk alerts if disabled
          const filteredAlerts = sidewalkAlertsEnabled ? 
            data.alerts : 
            data.alerts.filter(alert => !alert.toLowerCase().includes('sidewalk'));
          
          // Update visual alerts
          setAlerts(filteredAlerts);
          setProcessedImage(data.processed_image);
    
          // Only speak alerts if there are any after filtering and enough time has passed
          if (filteredAlerts && filteredAlerts.length > 0) {
            // Debounce speech output
            const now = Date.now();
            if (audioEnabled && now - lastUtteranceRef.current > minTimeBetweenUtterances) {
              const utterance = new SpeechSynthesisUtterance(filteredAlerts.join('. '));
              utterance.rate = 1.1;  // Slightly faster speech
              window.speechSynthesis.speak(utterance);
              lastUtteranceRef.current = now;
            }
            
            // Trigger haptic feedback if enabled
            triggerHapticFeedback(filteredAlerts);
          }
        }
      } catch (error) {
        console.error('Error processing frame:', error);
      } finally {
        setIsProcessing(false);
      }
    }
  }, [audioEnabled, compressImage, hapticEnabled, isCameraActive, isProcessing, sidewalkAlertsEnabled]);

  useEffect(() => {
    let intervalId = null;
    
    if (isCameraActive) {
      intervalId = setInterval(() => {
        captureAndProcess();
      }, processingInterval);
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [captureAndProcess, isCameraActive, processingInterval]);

  // Clean up speech recognition when component unmounts
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      // Clear any pending speech
      window.speechSynthesis.cancel();
    };
  }, []);

  // Configure the back camera via video constraints if available
  const videoConstraints = {
    facingMode: { exact: "environment" }
  };

  // Styles remain the same
  const containerStyle = {
    maxWidth: '100%',
    width: '100%',
    margin: '0 auto',
    padding: '10px',
    fontFamily: 'Arial, sans-serif',
    boxSizing: 'border-box'
  };

  const headerStyle = {
    textAlign: 'center',
    marginBottom: '20px'
  };

  const sectionStyle = {
    marginBottom: '30px'
  };

  const imageStyle = {
    width: '100%',
    border: '1px solid #ccc',
    borderRadius: '8px'
  };

  const buttonStyle = {
    padding: '10px 20px',
    fontSize: '1em',
    marginTop: '10px',
    cursor: 'pointer'
  };

  const statusIndicatorStyle = {
    padding: '8px 12px',
    borderRadius: '4px',
    display: 'inline-block',
    margin: '10px 0',
    fontWeight: 'bold',
    backgroundColor: isCameraActive ? '#4CAF50' : '#f44336',
    color: 'white'
  };

  // New loading indicator style
  const loadingIndicatorStyle = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    padding: '10px 20px',
    backgroundColor: 'rgba(0,0,0,0.7)',
    color: 'white',
    borderRadius: '5px',
    zIndex: 100
  };

  return (
    <div style={containerStyle}>
      <header style={headerStyle}>
        <h1 style={{ fontSize: '1.8em' }}>Safety Navigation Assistant</h1>
        <p style={{ fontSize: '1em', lineHeight: '1.4' }}>
          This app processes camera frames in real time and alerts you of hazards or sidewalk boundaries.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {!audioEnabled && (
            <button onClick={enableAudio} style={buttonStyle}>
              Enable Audio Alerts
            </button>
          )}
          
          {!hapticEnabled && isVibrationSupported() && (
            <button onClick={enableHaptic} style={buttonStyle}>
              Enable Haptic Feedback
            </button>
          )}

          {!voiceActivated ? (
            <button onClick={startVoiceRecognition} style={buttonStyle}>
              Enable Voice Control
            </button>
          ) : (
            <button onClick={stopVoiceRecognition} style={buttonStyle}>
              Disable Voice Control
            </button>
          )}

          {!isCameraActive ? (
            <button onClick={startCamera} style={buttonStyle}>
              Start Camera
            </button>
          ) : (
            <button onClick={stopCamera} style={buttonStyle}>
              Stop Camera
            </button>
          )}
          
          <button onClick={toggleSidewalkAlerts} style={buttonStyle}>
            {sidewalkAlertsEnabled ? 'Disable Sidewalk Alerts' : 'Enable Sidewalk Alerts'}
          </button>
        </div>

        {voiceActivated && (
          <div style={{ marginTop: '10px' }}>
            <p style={{ fontStyle: 'italic' }}>{listeningStatus}</p>
            <p>Voice commands: <strong>"Start"</strong>, <strong>"Stop"</strong>, <strong>"Enable sidewalk"</strong>, <strong>"Disable sidewalk"</strong></p>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '10px' }}>
          <div style={statusIndicatorStyle}>
            Camera: {isCameraActive ? 'Active' : 'Inactive'}
          </div>
          <div style={{...statusIndicatorStyle, backgroundColor: sidewalkAlertsEnabled ? '#4CAF50' : '#f44336'}}>
            Sidewalk Alerts: {sidewalkAlertsEnabled ? 'Enabled' : 'Disabled'}
          </div>
          <div style={{...statusIndicatorStyle, backgroundColor: '#2196F3'}}>
            Frame Rate: {processingInterval/1000}s
          </div>
        </div>
      </header>
      
      <main>
        <section style={sectionStyle}>
          <h2 style={{ fontSize: '1.5em' }}>Live Camera Feed</h2>
          <div style={{ position: 'relative' }}>
            <Webcam
              audio={false}
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              videoConstraints={videoConstraints}
              style={{
                width: '100%', 
                maxWidth: '100%', 
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}
            />
            {isProcessing && (
              <div style={loadingIndicatorStyle}>Processing...</div>
            )}
          </div>
        </section>

        <section style={sectionStyle}>
          <h2 style={{ fontSize: '1.5em' }}>Processed Frame</h2>
          {isCameraActive ? (
            processedImage ? (
              <img
                src={processedImage}
                alt="Processed frame with detected boundaries"
                style={imageStyle}
              />
            ) : (
              <p>Processing frames...</p>
            )
          ) : (
            <p>Camera is inactive. Start the camera to see processed frames.</p>
          )}
        </section>

        <section style={sectionStyle}>
          <h2 style={{ fontSize: '1.5em' }}>Alerts</h2>
          {isCameraActive ? (
            alerts.length > 0 ? (
              <ul style={{ listStyleType: 'disc', paddingLeft: '20px' }}>
                {alerts.map((alert, index) => (
                  <li key={index} style={{ marginBottom: '5px' }}>{alert}</li>
                ))}
              </ul>
            ) : (
              <p>No alerts at the moment.</p>
            )
          ) : (
            <p>Camera is inactive. Start the camera to see processed frames.</p>
          )}
        </section>
      </main>

      <footer style={{ textAlign: 'center', marginTop: '20px', fontSize: '0.9em', color: '#777' }}>
        <p>&copy; {new Date().getFullYear()} Safety Navigation Assistant</p>
      </footer>
    </div>
  );
};

export default App;