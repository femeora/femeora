// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ProtocolAccess} from "../access/ProtocolAccess.sol";
import {UUPSUpgradeable} from "../proxy/UUPSUpgradeable.sol";

contract LaunchIdentityVerifier is ProtocolAccess, UUPSUpgradeable {
    error InvalidSigner();
    error InvalidProof();
    error ProofExpired();

    bytes32 private constant PROTECTED_LAUNCH_TYPEHASH = keccak256("FEMEORA_PROTECTED_LAUNCH");
    address public trustedSigner;
    mapping(address account => uint256 nonce) public nonces;

    event TrustedSignerUpdated(address indexed previousSigner, address indexed signer);
    event IdentityConsumed(
        address indexed account, bytes32 indexed nameHash, bytes32 indexed symbolHash, uint256 nonce
    );

    constructor() {
        _disableInitializers();
    }

    function initialize(address admin, address upgrader, address trustedSigner_) external initializer {
        if (trustedSigner_ == address(0)) revert InvalidSigner();
        __ProtocolAccess_init(admin, upgrader);
        trustedSigner = trustedSigner_;
    }

    function setTrustedSigner(address signer) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (signer == address(0)) revert InvalidSigner();
        address previous = trustedSigner;
        trustedSigner = signer;
        emit TrustedSignerUpdated(previous, signer);
    }

    function consumeVerification(
        address account,
        bytes32 nameHash,
        bytes32 symbolHash,
        uint256 deadline,
        bytes calldata signature
    ) external onlyRole(FACTORY_ROLE) {
        if (block.timestamp > deadline) revert ProofExpired();
        uint256 nonce = nonces[account];
        bytes32 payload = keccak256(
            abi.encode(
                PROTECTED_LAUNCH_TYPEHASH, block.chainid, address(this), account, nameHash, symbolHash, nonce, deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", payload));
        if (_recover(digest, signature) != trustedSigner) revert InvalidProof();
        nonces[account] = nonce + 1;
        emit IdentityConsumed(account, nameHash, symbolHash, nonce);
    }

    function verificationPayload(address account, bytes32 nameHash, bytes32 symbolHash, uint256 deadline)
        external
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                PROTECTED_LAUNCH_TYPEHASH,
                block.chainid,
                address(this),
                account,
                nameHash,
                symbolHash,
                nonces[account],
                deadline
            )
        );
    }

    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address signer) {
        if (signature.length != 65) revert InvalidProof();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) revert InvalidProof();
        // Reject malleable signatures (secp256k1n / 2).
        if (uint256(s) > 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0) {
            revert InvalidProof();
        }
        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidProof();
    }

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}
}
