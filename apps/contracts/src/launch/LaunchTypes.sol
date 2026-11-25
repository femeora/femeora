// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

library LaunchTypes {
    uint24 internal constant PIPS_DENOMINATOR = 1_000_000;

    enum GraduationTarget {
        DAMM,
        DLMM
    }

    enum FeeCurve {
        Linear,
        Exponential
    }

    struct Identity {
        string name;
        string slug;
        string metadataURI;
        string domain;
        string xHandle;
    }

    struct Economics {
        address quoteToken;
        uint24 tradeFeePips;
        uint24 creatorSharePips;
        uint24 launchpadSharePips;
        uint24 protocolSharePips;
        uint24 lpCreatorSharePips;
        uint24 lpLaunchpadSharePips;
        uint24 lpProtocolSharePips;
        uint128 graduationThreshold;
        uint128 curveTokenSupply;
    }

    struct GraduationConfig {
        GraduationTarget target;
        uint24 startFeePips;
        uint24 endFeePips;
        uint32 durationSeconds;
        FeeCurve feeCurve;
        uint16 dlmmBinStepBps;
        uint8 dlmmSeedShape;
    }

    struct ProtectionConfig {
        bool enabled;
        bool xRequired;
        uint24 devBuyCapPips;
        uint24 earlyBuyCapPips;
        uint32 earlyBuyDurationSeconds;
    }

    struct Launchpad {
        address owner;
        address feeRecipient;
        Identity identity;
        Economics economics;
        GraduationConfig graduation;
        ProtectionConfig protection;
        bool active;
    }

    function validateEconomics(Economics memory economics) internal pure returns (bool) {
        return economics.quoteToken != address(0) && economics.tradeFeePips < PIPS_DENOMINATOR
            && economics.creatorSharePips + economics.launchpadSharePips + economics.protocolSharePips
                == PIPS_DENOMINATOR
            && economics.lpCreatorSharePips + economics.lpLaunchpadSharePips + economics.lpProtocolSharePips
                == PIPS_DENOMINATOR && economics.graduationThreshold != 0 && economics.curveTokenSupply != 0;
    }

    function validateIdentity(Identity memory identity) internal pure returns (bool) {
        bytes memory name = bytes(identity.name);
        bytes memory slug = bytes(identity.slug);
        if (
            name.length < 2 || name.length > 120 || slug.length < 2 || slug.length > 80
                || bytes(identity.metadataURI).length == 0 || bytes(identity.metadataURI).length > 2_048
                || bytes(identity.domain).length > 255 || bytes(identity.xHandle).length == 0
                || bytes(identity.xHandle).length > 15
        ) return false;
        if (slug[0] == bytes1("-") || slug[slug.length - 1] == bytes1("-")) return false;
        bool previousHyphen;
        for (uint256 i; i < slug.length; ++i) {
            bytes1 character = slug[i];
            bool hyphen = character == bytes1("-");
            bool alphaNumeric = (character >= bytes1("a") && character <= bytes1("z"))
                || (character >= bytes1("0") && character <= bytes1("9"));
            if ((!alphaNumeric && !hyphen) || (hyphen && previousHyphen)) return false;
            previousHyphen = hyphen;
        }
        return true;
    }

    function validateGraduation(GraduationConfig memory graduation) internal pure returns (bool) {
        if (graduation.target != GraduationTarget.DAMM) return false;
        return graduation.startFeePips > graduation.endFeePips && graduation.startFeePips < PIPS_DENOMINATOR
            && graduation.endFeePips != 0 && graduation.durationSeconds != 0;
    }

    function validateProtection(ProtectionConfig memory protection) internal pure returns (bool) {
        if (!protection.enabled && protection.xRequired) return false;
        return protection.devBuyCapPips <= PIPS_DENOMINATOR && protection.earlyBuyCapPips <= PIPS_DENOMINATOR;
    }
}
