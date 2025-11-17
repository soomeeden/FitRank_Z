# FitRank - Private Fitness Leaderboard

FitRank is a privacy-preserving fitness leaderboard that leverages Zama's Fully Homomorphic Encryption (FHE) technology to securely rank user fitness data without exposing sensitive information. Our innovative approach allows users to upload their steps and stats securely while maintaining their privacy regarding location and habits.

## The Problem

In today’s digital age, fitness tracking applications often expose personal information, such as location and exercise habits, creating privacy and security concerns for users. Traditional leaderboard systems rely on cleartext data, making them susceptible to data breaches and unauthorized access. This not only jeopardizes user privacy but also undermines the trust needed for such platforms to thrive.

## The Zama FHE Solution

FitRank addresses these privacy concerns through the use of state-of-the-art Fully Homomorphic Encryption (FHE). By enabling computation on encrypted data, we ensure that even during the ranking process, no personal information is revealed. Utilizing Zama's libraries, FitRank securely processes encrypted step counts, allowing us to generate leaderboards while preserving user privacy.

Using fhevm to process encrypted inputs, FitRank guarantees that only the final rankings are revealed, effectively mitigating risks associated with data exposure.

## Key Features

- 🔒 **Privacy Preservation**: User data is encrypted, ensuring confidentiality during processing.
- 🏆 **Anonymous Leaderboards**: Display rankings without revealing user identities or sensitive information.
- 🏃‍♂️ **Competitive Challenges**: Engage in challenges with friends while keeping your data private.
- 🎖️ **Achievements & Rewards**: Earn trophies and virtual shoes for reaching fitness milestones, all while maintaining privacy.
- 📊 **Real-time Updates**: Track progress and rankings without compromising personal data.

## Technical Architecture & Stack

FitRank is built on a robust technical architecture that ensures high performance and strong privacy guarantees. The key components are:

- **Core Privacy Engine**: Zama's Fully Homomorphic Encryption (FHE) technologies including:
  - fhevm: For smart contract processing of encrypted data.
  - Concrete ML: For machine learning models if applicable.
  - TFHE-rs: For low-level cryptographic operations.

- **Tech Stack**:
  - Frontend: React
  - Backend: Node.js
  - Database: Encrypted storage (e.g., Firebase)
  - Smart Contracts: Solidity with fhevm for handling encrypted computations.

## Smart Contract / Core Logic

Here is a simplified example of how we might implement the smart contract logic in Solidity, demonstrating the use of Zama's FHE libraries:

```solidity
pragma solidity ^0.8.0;

import "fhevm.sol"; // Zama's library for FHE

contract FitRank {
    struct User {
        uint64 encryptedSteps;
    }
    
    mapping(address => User) public users;
    
    function register(uint64 steps) public {
        uint64 encryptedSteps = TFHE.encrypt(steps); // Encrypt the steps
        users[msg.sender] = User(encryptedSteps);
    }

    function getLeaderboard() public view returns (address[] memory) {
        // Logic to generate the leaderboard goes here...
        // All computations happen on encrypted data!
    }
}
```

## Directory Structure

The project is organized as follows:

```
FitRank/
├── contracts/
│   └── FitRank.sol
├── src/
│   ├── App.js
│   ├── components/
│   └── styles/
├── tests/
│   └── FitRank.test.js
├── package.json
└── README.md
```

## Installation & Setup

Before you begin, ensure you have the following prerequisites installed:

- Node.js
- npm (Node Package Manager)
- Solidity compiler

### To install dependencies:

1. Navigate to the project directory:
   ```bash
   cd FitRank
   ```

2. Install the necessary Node packages:
   ```bash
   npm install
   ```

3. Install Zama's FHE library:
   ```bash
   npm install fhevm
   ```

## Build & Run

After setting up the project, you can build and run it with the following commands:

1. Compile the smart contracts:
   ```bash
   npx hardhat compile
   ```

2. Start the application:
   ```bash
   npm start
   ```

## Acknowledgements

We extend our deepest gratitude to Zama for providing the open-source Fully Homomorphic Encryption primitives that enable us to build secure, privacy-preserving applications. Without their innovative technology, FitRank would not exist.

---

With FitRank, not only can you engage in healthy competition, but you can also do so without worrying about your privacy. Join us on the journey to a more secure fitness experience!

