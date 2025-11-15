import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface FitnessData {
  id: string;
  name: string;
  steps: number;
  duration: number;
  calories: number;
  timestamp: number;
  creator: string;
  isVerified: boolean;
  decryptedValue: number;
  encryptedValueHandle?: string;
}

interface UserStats {
  totalSteps: number;
  avgDuration: number;
  totalCalories: number;
  weeklyGoal: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [fitnessData, setFitnessData] = useState<FitnessData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadingData, setUploadingData] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState({ 
    visible: false, 
    status: "pending" as const, 
    message: "" 
  });
  const [newFitnessData, setNewFitnessData] = useState({ 
    name: "", 
    steps: "", 
    duration: "", 
    calories: "" 
  });
  const [selectedData, setSelectedData] = useState<FitnessData | null>(null);
  const [userStats, setUserStats] = useState<UserStats>({
    totalSteps: 0,
    avgDuration: 0,
    totalCalories: 0,
    weeklyGoal: 10000
  });
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadFitnessData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadFitnessData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const fitnessList: FitnessData[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          fitnessList.push({
            id: businessId,
            name: businessData.name,
            steps: 0,
            duration: Number(businessData.publicValue1) || 0,
            calories: Number(businessData.publicValue2) || 0,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading fitness data:', e);
        }
      }
      
      setFitnessData(fitnessList);
      calculateUserStats(fitnessList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const calculateUserStats = (data: FitnessData[]) => {
    const userData = data.filter(item => item.creator.toLowerCase() === address?.toLowerCase());
    const totalSteps = userData.reduce((sum, item) => sum + (item.isVerified ? item.decryptedValue : 0), 0);
    const avgDuration = userData.length > 0 ? userData.reduce((sum, item) => sum + item.duration, 0) / userData.length : 0;
    const totalCalories = userData.reduce((sum, item) => sum + item.calories, 0);

    setUserStats({
      totalSteps,
      avgDuration,
      totalCalories,
      weeklyGoal: 10000
    });
  };

  const uploadFitnessData = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setUploadingData(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting fitness data with Zama FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const stepsValue = parseInt(newFitnessData.steps) || 0;
      const businessId = `fitness-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, stepsValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newFitnessData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        parseInt(newFitnessData.duration) || 0,
        parseInt(newFitnessData.calories) || 0,
        "Fitness Activity Data"
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Uploading encrypted data..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Fitness data uploaded successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadFitnessData();
      setShowUploadModal(false);
      setNewFitnessData({ name: "", steps: "", duration: "", calories: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected" 
        : "Upload failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setUploadingData(false); 
    }
  };

  const decryptSteps = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        setTransactionStatus({ visible: true, status: "success", message: "Steps already verified" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying steps..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadFitnessData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Steps verified successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ visible: true, status: "success", message: "Data already verified" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        await loadFitnessData();
        return null;
      }
      
      setTransactionStatus({ visible: true, status: "error", message: "Decryption failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const available = await contract.isAvailable();
      if (available) {
        setTransactionStatus({ visible: true, status: "success", message: "FHE System is available!" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      }
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const filteredData = fitnessData.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.creator.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sortedData = [...filteredData].sort((a, b) => {
    const aSteps = a.isVerified ? a.decryptedValue : 0;
    const bSteps = b.isVerified ? b.decryptedValue : 0;
    return bSteps - aSteps;
  });

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>FitRank_Z 🏃‍♂️</h1>
            <span>Private Fitness Leaderboard</span>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="fitness-icon">🏆</div>
            <h2>Connect Your Wallet to Start</h2>
            <p>Join the privacy-first fitness community with encrypted step tracking</p>
            <div className="feature-grid">
              <div className="feature">
                <span>🔐</span>
                <p>Encrypted Step Tracking</p>
              </div>
              <div className="feature">
                <span>🏃‍♂️</span>
                <p>Private Leaderboards</p>
              </div>
              <div className="feature">
                <span>⚡</span>
                <p>FHE-Powered Rankings</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Encryption...</p>
        <p className="loading-note">Securing your fitness data</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading Fitness Leaderboard...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>FitRank_Z 🏃‍♂️</h1>
          <span>Private Fitness Leaderboard</span>
        </div>
        
        <div className="header-actions">
          <button onClick={checkAvailability} className="status-btn">
            Check FHE Status
          </button>
          <button onClick={() => setShowUploadModal(true)} className="upload-btn">
            + Upload Workout
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="main-content">
        <div className="stats-panel">
          <div className="stat-card">
            <div className="stat-icon">👣</div>
            <div className="stat-content">
              <h3>Total Steps</h3>
              <div className="stat-value">{userStats.totalSteps.toLocaleString()}</div>
              <div className="stat-progress">
                <div 
                  className="progress-bar" 
                  style={{ width: `${Math.min(100, (userStats.totalSteps / userStats.weeklyGoal) * 100)}%` }}
                ></div>
                <span>{Math.round((userStats.totalSteps / userStats.weeklyGoal) * 100)}% of goal</span>
              </div>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon">⏱️</div>
            <div className="stat-content">
              <h3>Avg Duration</h3>
              <div className="stat-value">{userStats.avgDuration.toFixed(1)}min</div>
              <div className="stat-trend">Per session</div>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon">🔥</div>
            <div className="stat-content">
              <h3>Calories Burned</h3>
              <div className="stat-value">{userStats.totalCalories}</div>
              <div className="stat-trend">Total energy</div>
            </div>
          </div>
        </div>

        <div className="content-section">
          <div className="section-header">
            <h2>Fitness Leaderboard 🏆</h2>
            <div className="header-controls">
              <div className="search-box">
                <input 
                  type="text" 
                  placeholder="Search activities..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <button 
                onClick={loadFitnessData} 
                className="refresh-btn"
                disabled={isRefreshing}
              >
                {isRefreshing ? "🔄" : "Refresh"}
              </button>
              <button 
                onClick={() => setShowHistory(!showHistory)}
                className="history-btn"
              >
                {showHistory ? "Hide History" : "Show History"}
              </button>
            </div>
          </div>

          {showHistory && (
            <div className="history-panel">
              <h3>Your Workout History</h3>
              <div className="history-list">
                {fitnessData.filter(item => item.creator.toLowerCase() === address?.toLowerCase()).map((item, index) => (
                  <div key={index} className="history-item">
                    <span>{item.name}</span>
                    <span>{item.duration}min</span>
                    <span>{item.calories} cal</span>
                    <span>{item.isVerified ? `${item.decryptedValue} steps` : "🔒 Encrypted"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="leaderboard">
            {sortedData.length === 0 ? (
              <div className="empty-state">
                <div className="trophy-icon">🏆</div>
                <p>No fitness data yet</p>
                <button onClick={() => setShowUploadModal(true)} className="upload-btn">
                  Be the first to upload!
                </button>
              </div>
            ) : (
              sortedData.map((item, index) => (
                <div key={item.id} className="leaderboard-item">
                  <div className="rank">#{index + 1}</div>
                  <div className="user-info">
                    <div className="user-name">{item.name}</div>
                    <div className="user-details">
                      <span>⏱️ {item.duration}min</span>
                      <span>🔥 {item.calories} cal</span>
                      <span>{new Date(item.timestamp * 1000).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="steps-info">
                    {item.isVerified ? (
                      <div className="verified-steps">
                        <strong>{item.decryptedValue.toLocaleString()} steps</strong>
                        <span className="verified-badge">✅ Verified</span>
                      </div>
                    ) : (
                      <div className="encrypted-steps">
                        <strong>🔒 Encrypted</strong>
                        <button 
                          onClick={() => decryptSteps(item.id)}
                          className="verify-btn"
                          disabled={fheIsDecrypting}
                        >
                          {fheIsDecrypting ? "Verifying..." : "Verify Steps"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      
      {showUploadModal && (
        <UploadModal 
          onSubmit={uploadFitnessData} 
          onClose={() => setShowUploadModal(false)} 
          uploading={uploadingData} 
          fitnessData={newFitnessData} 
          setFitnessData={setNewFitnessData}
          isEncrypting={isEncrypting}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-toast">
          <div className={`toast-content ${transactionStatus.status}`}>
            <div className="toast-icon">
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="toast-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const UploadModal: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  uploading: boolean;
  fitnessData: any;
  setFitnessData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, uploading, fitnessData, setFitnessData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFitnessData({ ...fitnessData, [name]: value });
  };

  return (
    <div className="modal-overlay">
      <div className="upload-modal">
        <div className="modal-header">
          <h2>Upload Workout Data</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <strong>FHE 🔐 Protection</strong>
            <p>Step count will be encrypted using Zama FHE technology</p>
          </div>
          
          <div className="form-group">
            <label>Activity Name *</label>
            <input 
              type="text" 
              name="name" 
              value={fitnessData.name} 
              onChange={handleChange} 
              placeholder="Morning Run, Gym Session..." 
            />
          </div>
          
          <div className="form-group">
            <label>Steps (FHE Encrypted) *</label>
            <input 
              type="number" 
              name="steps" 
              value={fitnessData.steps} 
              onChange={handleChange} 
              placeholder="Enter step count..." 
              min="0"
            />
            <div className="input-hint">Encrypted with Zama FHE</div>
          </div>
          
          <div className="form-group">
            <label>Duration (minutes) *</label>
            <input 
              type="number" 
              name="duration" 
              value={fitnessData.duration} 
              onChange={handleChange} 
              placeholder="Workout duration..." 
              min="1"
            />
          </div>
          
          <div className="form-group">
            <label>Calories Burned *</label>
            <input 
              type="number" 
              name="calories" 
              value={fitnessData.calories} 
              onChange={handleChange} 
              placeholder="Estimated calories..." 
              min="0"
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={uploading || isEncrypting || !fitnessData.name || !fitnessData.steps || !fitnessData.duration || !fitnessData.calories} 
            className="submit-btn"
          >
            {uploading || isEncrypting ? "🔐 Encrypting..." : "Upload Workout"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;

