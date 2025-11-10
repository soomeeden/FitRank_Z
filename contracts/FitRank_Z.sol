pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract FitRank is ZamaEthereumConfig {
    struct Participant {
        address userAddress;
        euint32 encryptedSteps;
        uint32 decryptedSteps;
        bool isVerified;
        uint256 lastUpdated;
    }

    struct Challenge {
        string challengeId;
        uint256 startTime;
        uint256 endTime;
        uint256 rewardPool;
        bool isActive;
        mapping(address => bool) participants;
        address[] participantList;
    }

    mapping(string => Challenge) public challenges;
    mapping(address => Participant) public participants;
    string[] public challengeIds;

    event ChallengeCreated(string challengeId, uint256 startTime, uint256 endTime, uint256 rewardPool);
    event StepsSubmitted(address indexed user, string challengeId, euint32 encryptedSteps);
    event StepsVerified(address indexed user, string challengeId, uint32 decryptedSteps);
    event RewardDistributed(string challengeId, address[] winners, uint256[] amounts);

    constructor() ZamaEthereumConfig() {}

    function createChallenge(
        string calldata challengeId,
        uint256 startTime,
        uint256 endTime,
        uint256 rewardPool
    ) external {
        require(bytes(challenges[challengeId].challengeId).length == 0, "Challenge already exists");
        require(endTime > startTime, "Invalid time range");
        require(rewardPool > 0, "Reward pool must be positive");

        challenges[challengeId] = Challenge({
        challengeId: challengeId,
        startTime: startTime,
        endTime: endTime,
        rewardPool: rewardPool,
        isActive: true
        });
        challengeIds.push(challengeId);

        emit ChallengeCreated(challengeId, startTime, endTime, rewardPool);
    }

    function joinChallenge(string calldata challengeId) external {
        require(challenges[challengeId].isActive, "Challenge not active");
        require(block.timestamp >= challenges[challengeId].startTime && block.timestamp <= challenges[challengeId].endTime, "Challenge not in progress");
        require(!challenges[challengeId].participants[msg.sender], "Already joined");

        challenges[challengeId].participants[msg.sender] = true;
        challenges[challengeId].participantList.push(msg.sender);
    }

    function submitSteps(
        string calldata challengeId,
        externalEuint32 encryptedSteps,
        bytes calldata inputProof
    ) external {
        require(challenges[challengeId].isActive, "Challenge not active");
        require(block.timestamp >= challenges[challengeId].startTime && block.timestamp <= challenges[challengeId].endTime, "Challenge not in progress");
        require(challenges[challengeId].participants[msg.sender], "Not a participant");

        require(FHE.isInitialized(FHE.fromExternal(encryptedSteps, inputProof)), "Invalid encrypted input");

        Participant storage participant = participants[msg.sender];
        participant.encryptedSteps = FHE.fromExternal(encryptedSteps, inputProof);
        participant.lastUpdated = block.timestamp;

        FHE.allowThis(participant.encryptedSteps);
        FHE.makePubliclyDecryptable(participant.encryptedSteps);

        emit StepsSubmitted(msg.sender, challengeId, participant.encryptedSteps);
    }

    function verifySteps(
        string calldata challengeId,
        bytes memory abiEncodedClearValue,
        bytes memory decryptionProof
    ) external {
        require(challenges[challengeId].isActive, "Challenge not active");
        require(block.timestamp > challenges[challengeId].endTime, "Challenge still in progress");

        Participant storage participant = participants[msg.sender];
        require(!participant.isVerified, "Steps already verified");

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(participant.encryptedSteps);

        FHE.checkSignatures(cts, abiEncodedClearValue, decryptionProof);

        uint32 decodedSteps = abi.decode(abiEncodedClearValue, (uint32));
        participant.decryptedSteps = decodedSteps;
        participant.isVerified = true;

        emit StepsVerified(msg.sender, challengeId, decodedSteps);
    }

    function distributeRewards(string calldata challengeId) external {
        require(challenges[challengeId].isActive, "Challenge not active");
        require(block.timestamp > challenges[challengeId].endTime, "Challenge still in progress");

        Challenge storage challenge = challenges[challengeId];
        address[] memory winners = new address[](3);
        uint256[] memory amounts = new uint256[](3);

        // Find top 3 participants
        uint32 firstPlaceSteps = 0;
        uint32 secondPlaceSteps = 0;
        uint32 thirdPlaceSteps = 0;

        for (uint i = 0; i < challenge.participantList.length; i++) {
            address user = challenge.participantList[i];
            Participant storage participant = participants[user];

            if (participant.isVerified) {
                if (participant.decryptedSteps > firstPlaceSteps) {
                    thirdPlaceSteps = secondPlaceSteps;
                    secondPlaceSteps = firstPlaceSteps;
                    firstPlaceSteps = participant.decryptedSteps;
                    winners[2] = winners[1];
                    winners[1] = winners[0];
                    winners[0] = user;
                } else if (participant.decryptedSteps > secondPlaceSteps) {
                    thirdPlaceSteps = secondPlaceSteps;
                    secondPlaceSteps = participant.decryptedSteps;
                    winners[2] = winners[1];
                    winners[1] = user;
                } else if (participant.decryptedSteps > thirdPlaceSteps) {
                    thirdPlaceSteps = participant.decryptedSteps;
                    winners[2] = user;
                }
            }
        }

        // Distribute rewards
        if (winners[0] != address(0)) {
            amounts[0] = challenge.rewardPool * 50 / 100;
            payable(winners[0]).transfer(amounts[0]);
        }
        if (winners[1] != address(0)) {
            amounts[1] = challenge.rewardPool * 30 / 100;
            payable(winners[1]).transfer(amounts[1]);
        }
        if (winners[2] != address(0)) {
            amounts[2] = challenge.rewardPool * 20 / 100;
            payable(winners[2]).transfer(amounts[2]);
        }

        challenge.isActive = false;

        emit RewardDistributed(challengeId, winners, amounts);
    }

    function getParticipant(address user) external view returns (
        euint32 encryptedSteps,
        uint32 decryptedSteps,
        bool isVerified,
        uint256 lastUpdated
    ) {
        Participant storage participant = participants[user];
        return (
        participant.encryptedSteps,
        participant.decryptedSteps,
        participant.isVerified,
        participant.lastUpdated
        );
    }

    function getChallenge(string calldata challengeId) external view returns (
        uint256 startTime,
        uint256 endTime,
        uint256 rewardPool,
        bool isActive
    ) {
        Challenge storage challenge = challenges[challengeId];
        return (
        challenge.startTime,
        challenge.endTime,
        challenge.rewardPool,
        challenge.isActive
        );
    }

    function getAllChallenges() external view returns (string[] memory) {
        return challengeIds;
    }

    function isAvailable() public pure returns (bool) {
        return true;
    }
}

