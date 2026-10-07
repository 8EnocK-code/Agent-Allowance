// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ProofOfThought
 * @notice On-chain notary for AI outputs. An agent commits hashes of its prompt and
 *         output (plus a model label); anyone can later verify that this exact
 *         pair was committed by that agent at a given time. Only hashes are stored,
 *         so no prompt or answer content is ever published.
 *
 *         The first commit of a given (agent, promptHash, outputHash) wins, so a
 *         timestamp can never be moved later by re-committing.
 */
contract ProofOfThought {
    struct Receipt {
        address agent;
        uint64 timestamp;
        bytes32 promptHash;
        bytes32 outputHash;
        string model;
    }

    uint256 public receiptCount;
    uint256 public constant MAX_MODEL_LENGTH = 64;

    mapping(uint256 => Receipt) private _receipts;
    // digest(agent, promptHash, outputHash) => receiptId (ids start at 1)
    mapping(bytes32 => uint256) private _idByDigest;

    event ReceiptCommitted(
        uint256 indexed id,
        address indexed agent,
        bytes32 indexed outputHash,
        bytes32 promptHash,
        string model
    );

    error AlreadyCommitted(uint256 id);
    error EmptyHash();
    error ModelTooLong();
    error UnknownReceipt();

    /// @notice Commit a receipt for the caller (the agent).
    function commit(bytes32 promptHash, bytes32 outputHash, string calldata model) external returns (uint256 id) {
        if (promptHash == bytes32(0) || outputHash == bytes32(0)) revert EmptyHash();
        if (bytes(model).length > MAX_MODEL_LENGTH) revert ModelTooLong();

        bytes32 digest = _digest(msg.sender, promptHash, outputHash);
        uint256 existing = _idByDigest[digest];
        if (existing != 0) revert AlreadyCommitted(existing);

        id = ++receiptCount;
        _idByDigest[digest] = id;
        _receipts[id] = Receipt({
            agent: msg.sender,
            timestamp: uint64(block.timestamp),
            promptHash: promptHash,
            outputHash: outputHash,
            model: model
        });
        emit ReceiptCommitted(id, msg.sender, outputHash, promptHash, model);
    }

    /// @notice Check whether `agent` committed this (prompt, output) pair.
    /// @return found true if committed
    /// @return id receipt id (0 if not found)
    /// @return timestamp block time of the commit (0 if not found)
    function verify(address agent, bytes32 promptHash, bytes32 outputHash)
        external
        view
        returns (bool found, uint256 id, uint64 timestamp)
    {
        id = _idByDigest[_digest(agent, promptHash, outputHash)];
        if (id == 0) return (false, 0, 0);
        return (true, id, _receipts[id].timestamp);
    }

    /// @notice Fetch a receipt by id.
    function getReceipt(uint256 id) external view returns (Receipt memory) {
        if (id == 0 || id > receiptCount) revert UnknownReceipt();
        return _receipts[id];
    }

    function _digest(address agent, bytes32 promptHash, bytes32 outputHash) private pure returns (bytes32) {
        return keccak256(abi.encode(agent, promptHash, outputHash));
    }
}
