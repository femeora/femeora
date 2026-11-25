// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {DammPool} from "../src/core/DammPool.sol";
import {DammPoolDeployer} from "../src/core/DammPoolDeployer.sol";
import {DlmmPoolV2Deployer} from "../src/core/DlmmPoolV2Deployer.sol";
import {PoolFactory} from "../src/core/PoolFactory.sol";
import {PoolRegistry} from "../src/core/PoolRegistry.sol";
import {PositionManagerV2} from "../src/liquidity/PositionManagerV2.sol";
import {ERC1967Proxy} from "../src/proxy/ERC1967Proxy.sol";
import {BondingCurveLaunch} from "../src/launch/BondingCurveLaunch.sol";
import {Graduator} from "../src/launch/Graduator.sol";
import {LaunchConfigRegistry} from "../src/launch/LaunchConfigRegistry.sol";
import {LaunchFactory} from "../src/launch/LaunchFactory.sol";
import {LaunchIdentityVerifier} from "../src/launch/LaunchIdentityVerifier.sol";
import {LaunchpadFactory} from "../src/launch/LaunchpadFactory.sol";
import {LaunchpadRegistry} from "../src/launch/LaunchpadRegistry.sol";
import {LaunchTypes} from "../src/launch/LaunchTypes.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

interface LaunchFlowVm {
    function startPrank(address account) external;
    function stopPrank() external;
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
}

contract LaunchFlowTest {
    LaunchFlowVm private constant vm = LaunchFlowVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant LAUNCHPAD_RECIPIENT = address(0xBEEF);
    address private constant PROTOCOL_RECIPIENT = address(0xCAFE);
    uint256 private constant IDENTITY_SIGNER_KEY = 0xA11CE;

    MockERC20 private quote;
    PoolFactory private poolFactory;
    PoolRegistry private poolRegistry;
    PositionManagerV2 private positionManager;
    LaunchpadFactory private launchpadFactory;
    LaunchpadRegistry private launchpadRegistry;
    LaunchFactory private launchFactory;
    LaunchIdentityVerifier private identityVerifier;
    Graduator private graduator;

    function setUp() public {
        quote = new MockERC20("Quote", "QUOTE", 18);

        PoolRegistry registryImplementation = new PoolRegistry();
        poolRegistry = PoolRegistry(
            address(
                new ERC1967Proxy(
                    address(registryImplementation),
                    abi.encodeCall(PoolRegistry.initialize, (address(this), address(this), address(this)))
                )
            )
        );
        PoolFactory poolFactoryImplementation = new PoolFactory();
        poolFactory = PoolFactory(address(new ERC1967Proxy(address(poolFactoryImplementation), "")));
        DammPoolDeployer dammDeployer = new DammPoolDeployer(address(poolFactory));
        DlmmPoolV2Deployer dlmmDeployer = new DlmmPoolV2Deployer(address(poolFactory));
        poolFactory.initialize(
            address(this), address(this), poolRegistry, PROTOCOL_RECIPIENT, 100_000, dammDeployer, dlmmDeployer
        );
        poolRegistry.setRole(poolRegistry.FACTORY_ROLE(), address(poolFactory), true);

        PositionManagerV2 managerImplementation = new PositionManagerV2();
        positionManager = PositionManagerV2(
            address(
                new ERC1967Proxy(
                    address(managerImplementation),
                    abi.encodeCall(PositionManagerV2.initialize, (address(this), address(this), poolRegistry))
                )
            )
        );

        Graduator graduatorImplementation = new Graduator();
        graduator = Graduator(
            address(
                new ERC1967Proxy(
                    address(graduatorImplementation),
                    abi.encodeCall(Graduator.initialize, (address(this), address(this), poolFactory, positionManager))
                )
            )
        );
        poolFactory.setRole(poolFactory.FACTORY_ROLE(), address(graduator), true);

        launchpadRegistry = LaunchpadRegistry(
            address(
                new ERC1967Proxy(
                    address(new LaunchpadRegistry()),
                    abi.encodeCall(LaunchpadRegistry.initialize, (address(this), address(this)))
                )
            )
        );
        LaunchConfigRegistry configRegistry = LaunchConfigRegistry(
            address(
                new ERC1967Proxy(
                    address(new LaunchConfigRegistry()),
                    abi.encodeCall(LaunchConfigRegistry.initialize, (address(this), address(this)))
                )
            )
        );
        launchpadFactory = LaunchpadFactory(
            address(
                new ERC1967Proxy(
                    address(new LaunchpadFactory()),
                    abi.encodeCall(
                        LaunchpadFactory.initialize,
                        (
                            address(this),
                            address(this),
                            launchpadRegistry,
                            configRegistry,
                            _singleAddress(address(quote))
                        )
                    )
                )
            )
        );
        launchpadRegistry.setRole(launchpadRegistry.FACTORY_ROLE(), address(launchpadFactory), true);
        configRegistry.setRole(configRegistry.FACTORY_ROLE(), address(launchpadFactory), true);

        identityVerifier = LaunchIdentityVerifier(
            address(
                new ERC1967Proxy(
                    address(new LaunchIdentityVerifier()),
                    abi.encodeCall(
                        LaunchIdentityVerifier.initialize, (address(this), address(this), vm.addr(IDENTITY_SIGNER_KEY))
                    )
                )
            )
        );
        launchFactory = LaunchFactory(
            address(
                new ERC1967Proxy(
                    address(new LaunchFactory()),
                    abi.encodeCall(
                        LaunchFactory.initialize,
                        (
                            address(this),
                            address(this),
                            launchpadRegistry,
                            configRegistry,
                            graduator,
                            identityVerifier,
                            PROTOCOL_RECIPIENT
                        )
                    )
                )
            )
        );
        identityVerifier.setRole(identityVerifier.FACTORY_ROLE(), address(launchFactory), true);
        graduator.setLaunchFactory(address(launchFactory));
    }

    function testLaunchAutoGraduatesLocksLiquidityAndSplitsLpFees() public {
        uint256 launchpadId = _createLaunchpad(LaunchTypes.ProtectionConfig(false, false, 1_000_000, 1_000_000, 0));

        (, address tokenAddress, address curveAddress) = launchFactory.launchToken(
            launchpadId, "Example Token", "EXM", "data:application/json;base64,e30=", 1_000_000_000 ether, 0, ""
        );
        BondingCurveLaunch curve = BondingCurveLaunch(curveAddress);
        uint256 quoteIn = 102 ether;
        quote.mint(address(this), quoteIn + 10 ether);
        quote.approve(curveAddress, type(uint256).max);
        curve.buy(quoteIn, 0, address(this), block.timestamp + 1);

        require(curve.graduated(), "not graduated automatically");
        uint256 netQuoteRaised = curve.virtualQuoteReserve() - curve.virtualQuoteReserveSeed();
        require(
            uint256(curve.virtualQuoteReserveSeed()) * 1_000_000 / netQuoteRaised < 10_000,
            "final curve/DAMM price deviation"
        );
        Graduator.RegisteredLaunch memory record = graduator.registeredLaunch(curveAddress);
        require(record.pool != address(0) && record.positionId != 0, "graduation missing");
        require(positionManager.positionLocked(record.positionId), "launch LP not locked");
        require(poolFactory.tokenReserveCaps(address(quote)) == 0, "launch changed global quote cap");
        require(poolFactory.tokenReserveCaps(tokenAddress) == 0, "launch changed global token cap");
        (bool decreaseSucceeded,) = address(positionManager)
            .call(
                abi.encodeCall(
                    PositionManagerV2.decreaseDamm,
                    (record.positionId, uint16(1), 0, 0, address(this), block.timestamp + 1)
                )
            );
        require(!decreaseSucceeded, "locked principal decreased");

        DammPool pool = DammPool(record.pool);
        uint256 creatorBefore = quote.balanceOf(address(this));
        uint256 launchpadBefore = quote.balanceOf(LAUNCHPAD_RECIPIENT);
        uint256 protocolBefore = quote.balanceOf(PROTOCOL_RECIPIENT);
        quote.approve(address(pool), type(uint256).max);
        pool.swapExactInput(address(quote), 1 ether, 0, address(this), block.timestamp + 1);
        creatorBefore = quote.balanceOf(address(this));
        graduator.claimLaunchFees(curveAddress);

        uint256 creatorPaid = quote.balanceOf(address(this)) - creatorBefore;
        uint256 launchpadPaid = quote.balanceOf(LAUNCHPAD_RECIPIENT) - launchpadBefore;
        uint256 protocolPaid = quote.balanceOf(PROTOCOL_RECIPIENT) - protocolBefore;
        require(creatorPaid != 0, "creator fee missing");
        require(creatorPaid >= launchpadPaid * 2 - 1 && creatorPaid <= launchpadPaid * 2 + 1, "creator split");
        require(launchpadPaid >= protocolPaid - 2 && launchpadPaid <= protocolPaid + 2, "owner/protocol split");
        require(tokenAddress != address(0), "token missing");
    }

    function testVirtualReserveScalesWithQuoteDecimals() public {
        MockERC20 sixDecimalQuote = new MockERC20("Six Decimal Quote", "SIX", 6);
        launchpadFactory.setQuoteTokenSupport(address(sixDecimalQuote), true);
        uint256 launchpadId = launchpadFactory.createLaunchpad(
            address(this),
            LAUNCHPAD_RECIPIENT,
            new address[](0),
            LaunchTypes.Identity("Six Decimal Pad", "six-decimal", "data:application/json;base64,e30=", "", "six"),
            LaunchTypes.Economics({
                quoteToken: address(sixDecimalQuote),
                tradeFeePips: 3_000,
                creatorSharePips: 500_000,
                launchpadSharePips: 300_000,
                protocolSharePips: 200_000,
                lpCreatorSharePips: 500_000,
                lpLaunchpadSharePips: 250_000,
                lpProtocolSharePips: 250_000,
                graduationThreshold: uint128(5_000 * 1e6),
                curveTokenSupply: uint128(800_000_000 ether)
            }),
            LaunchTypes.GraduationConfig({
                target: LaunchTypes.GraduationTarget.DAMM,
                startFeePips: 500_000,
                endFeePips: 3_000,
                durationSeconds: 30 minutes,
                feeCurve: LaunchTypes.FeeCurve.Linear,
                dlmmBinStepBps: 0,
                dlmmSeedShape: 0
            }),
            LaunchTypes.ProtectionConfig(false, false, 1_000_000, 1_000_000, 0)
        );
        (,, address curveAddress) = launchFactory.launchToken(
            launchpadId, "Six Decimal Token", "SIXD", "data:application/json;base64,e30=", 1_000_000_000 ether, 0, ""
        );
        require(BondingCurveLaunch(curveAddress).virtualQuoteReserveSeed() == 5 * 1e6, "quote-decimal reserve scaling");
    }

    function testProtectedLaunchRequiresIdentityProof() public {
        uint256 launchpadId = _createLaunchpad(LaunchTypes.ProtectionConfig(true, true, 100_000, 50_000, 1 hours));
        (bool succeeded,) = address(launchFactory)
            .call(
                abi.encodeCall(
                    LaunchFactory.launchToken,
                    (
                        launchpadId,
                        "Protected",
                        "PRO",
                        "data:application/json;base64,e30=",
                        1_000_000_000 ether,
                        block.timestamp + 1 hours,
                        bytes("")
                    )
                )
            );
        require(!succeeded, "empty X proof accepted");
    }

    function testProtectedLaunchWithoutXRequirementDoesNotRequireProof() public {
        uint256 launchpadId = _createLaunchpad(LaunchTypes.ProtectionConfig(true, false, 100_000, 50_000, 1 hours));
        (, address tokenAddress, address curveAddress) = launchFactory.launchToken(
            launchpadId, "Protected No X", "PNX", "data:application/json;base64,e30=", 800_000_000 ether, 0, ""
        );
        require(tokenAddress != address(0) && curveAddress != address(0), "protected launch without X failed");
    }

    function testLaunchpadAdminCanPauseAndActivate() public {
        address admin = address(0xAD1);
        address[] memory admins = new address[](1);
        admins[0] = admin;
        uint256 launchpadId =
            _createLaunchpadWithAdmins(LaunchTypes.ProtectionConfig(false, false, 1_000_000, 1_000_000, 0), admins);
        vm.startPrank(admin);
        launchpadFactory.setLaunchpadStatus(launchpadId, false);
        require(!launchpadRegistry.launchpad(launchpadId).active, "admin did not pause launchpad");
        launchpadFactory.setLaunchpadStatus(launchpadId, true);
        vm.stopPrank();
        require(launchpadRegistry.launchpad(launchpadId).active, "admin did not activate launchpad");
    }

    function testCurveFeeSplitMatchesLaunchpadConfiguration() public {
        uint256 launchpadId = _createLaunchpad(LaunchTypes.ProtectionConfig(false, false, 1_000_000, 1_000_000, 0));
        (,, address curveAddress) = launchFactory.launchToken(
            launchpadId, "Fee Token", "FEE", "data:application/json;base64,e30=", 1_000_000_000 ether, 0, ""
        );
        address buyer = address(0xA11CE);
        uint256 quoteIn = 10 ether;
        uint256 fee = quoteIn * 3_000 / 1_000_000;
        quote.mint(buyer, quoteIn);
        vm.startPrank(buyer);
        quote.approve(curveAddress, quoteIn);
        BondingCurveLaunch(curveAddress).buy(quoteIn, 0, buyer, block.timestamp + 1);
        vm.stopPrank();
        require(quote.balanceOf(address(this)) == fee * 500_000 / 1_000_000, "creator curve split");
        require(quote.balanceOf(LAUNCHPAD_RECIPIENT) == fee * 300_000 / 1_000_000, "launchpad curve split");
        require(quote.balanceOf(PROTOCOL_RECIPIENT) == fee * 200_000 / 1_000_000, "protocol curve split");
    }

    function testProtectedLaunchEnforcesDeveloperBuyCap() public {
        uint256 launchpadId = _createLaunchpad(LaunchTypes.ProtectionConfig(true, false, 10_000, 10_000, 1 hours));
        uint256 deadline = block.timestamp + 1 hours;
        (,, address curveAddress) = launchFactory.launchToken(
            launchpadId,
            "Protected",
            "PRO",
            "data:application/json;base64,e30=",
            800_000_000 ether,
            deadline,
            _protectedProof(address(this), "Protected", "PRO", deadline)
        );
        quote.mint(address(this), 2 ether);
        quote.approve(curveAddress, type(uint256).max);
        (bool succeeded,) =
            curveAddress.call(abi.encodeCall(BondingCurveLaunch.buy, (2 ether, 0, address(this), block.timestamp + 1)));
        require(!succeeded, "developer cap bypassed");
    }

    function testProtectedLaunchRejectsDeveloperAllocationAboveCap() public {
        uint256 launchpadId = _createLaunchpad(LaunchTypes.ProtectionConfig(true, false, 10_000, 10_000, 1 hours));
        uint256 deadline = block.timestamp + 1 hours;
        (bool succeeded,) = address(launchFactory)
            .call(
                abi.encodeCall(
                    LaunchFactory.launchToken,
                    (
                        launchpadId,
                        "Protected",
                        "PRO",
                        "data:application/json;base64,e30=",
                        808_000_001 ether,
                        deadline,
                        _protectedProof(address(this), "Protected", "PRO", deadline)
                    )
                )
            );
        require(!succeeded, "developer allocation cap bypassed");
    }

    function testProtectedLaunchCountsDeveloperAllocationTowardBuyCap() public {
        uint256 launchpadId = _createLaunchpad(LaunchTypes.ProtectionConfig(true, false, 10_000, 10_000, 1 hours));
        uint256 deadline = block.timestamp + 1 hours;
        (,, address curveAddress) = launchFactory.launchToken(
            launchpadId,
            "Protected",
            "PRO",
            "data:application/json;base64,e30=",
            808_000_000 ether,
            deadline,
            _protectedProof(address(this), "Protected", "PRO", deadline)
        );
        require(
            BondingCurveLaunch(curveAddress).tokensBought(address(this)) == 8_000_000 ether, "allocation not counted"
        );
        quote.mint(address(this), 1);
        quote.approve(curveAddress, 1);
        (bool succeeded,) =
            curveAddress.call(abi.encodeCall(BondingCurveLaunch.buy, (1, 0, address(this), block.timestamp + 1)));
        require(!succeeded, "developer bought above allocation cap");
    }

    function testProtectedLaunchEnforcesEarlyBuyerCap() public {
        uint256 launchpadId = _createLaunchpad(LaunchTypes.ProtectionConfig(true, false, 1_000_000, 10_000, 1 hours));
        uint256 deadline = block.timestamp + 1 hours;
        (,, address curveAddress) = launchFactory.launchToken(
            launchpadId,
            "Protected",
            "PRO",
            "data:application/json;base64,e30=",
            1_000_000_000 ether,
            deadline,
            _protectedProof(address(this), "Protected", "PRO", deadline)
        );
        address buyer = address(0xA11CE);
        quote.mint(buyer, 2 ether);
        vm.startPrank(buyer);
        quote.approve(curveAddress, type(uint256).max);
        (bool succeeded,) =
            curveAddress.call(abi.encodeCall(BondingCurveLaunch.buy, (2 ether, 0, buyer, block.timestamp + 1)));
        vm.stopPrank();
        require(!succeeded, "early buyer cap bypassed");
    }

    function testProtectedLaunchReservesNormalizedNameAndSymbolOnChain() public {
        uint256 launchpadId = _createLaunchpad(LaunchTypes.ProtectionConfig(true, false, 1_000_000, 1_000_000, 0));
        uint256 deadline = block.timestamp + 1 hours;
        launchFactory.launchToken(
            launchpadId,
            "Protected Token",
            "SAFE",
            "data:application/json;base64,e30=",
            1_000_000_000 ether,
            deadline,
            _protectedProof(address(this), "Protected Token", "SAFE", deadline)
        );
        address impersonator = address(0xBAD);
        vm.startPrank(impersonator);
        (bool succeeded,) = address(launchFactory)
            .call(
                abi.encodeCall(
                    LaunchFactory.launchToken,
                    (
                        launchpadId,
                        "protected token",
                        "safe",
                        "data:application/json;base64,e30=",
                        1_000_000_000 ether,
                        deadline,
                        _protectedProof(impersonator, "protected token", "safe", deadline)
                    )
                )
            );
        vm.stopPrank();
        require(!succeeded, "protected identity reused by another creator");
    }

    function _protectedProof(address account, string memory name, string memory symbol, uint256 deadline)
        private
        returns (bytes memory)
    {
        bytes32 nameHash = keccak256(_asciiLower(bytes(name)));
        bytes32 symbolHash = keccak256(_asciiLower(bytes(symbol)));
        bytes32 payload = identityVerifier.verificationPayload(account, nameHash, symbolHash, deadline);
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", payload));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(IDENTITY_SIGNER_KEY, digest);
        return abi.encodePacked(r, s, v);
    }

    function _asciiLower(bytes memory value) private pure returns (bytes memory) {
        for (uint256 i; i < value.length; ++i) {
            uint8 character = uint8(value[i]);
            if (character >= 65 && character <= 90) value[i] = bytes1(character + 32);
        }
        return value;
    }

    function _createLaunchpad(LaunchTypes.ProtectionConfig memory protection) private returns (uint256) {
        return _createLaunchpadWithAdmins(protection, new address[](0));
    }

    function _singleAddress(address value) private pure returns (address[] memory values) {
        values = new address[](1);
        values[0] = value;
    }

    function _createLaunchpadWithAdmins(LaunchTypes.ProtectionConfig memory protection, address[] memory admins)
        private
        returns (uint256)
    {
        return launchpadFactory.createLaunchpad(
            address(this),
            LAUNCHPAD_RECIPIENT,
            admins,
            LaunchTypes.Identity("Example Pad", "example", "data:application/json;base64,e30=", "", "example"),
            LaunchTypes.Economics({
                quoteToken: address(quote),
                tradeFeePips: 3_000,
                creatorSharePips: 500_000,
                launchpadSharePips: 300_000,
                protocolSharePips: 200_000,
                lpCreatorSharePips: 500_000,
                lpLaunchpadSharePips: 250_000,
                lpProtocolSharePips: 250_000,
                graduationThreshold: uint128(101 ether),
                curveTokenSupply: uint128(800_000_000 ether)
            }),
            LaunchTypes.GraduationConfig({
                target: LaunchTypes.GraduationTarget.DAMM,
                startFeePips: 500_000,
                endFeePips: 3_000,
                durationSeconds: 30 minutes,
                feeCurve: LaunchTypes.FeeCurve.Linear,
                dlmmBinStepBps: 0,
                dlmmSeedShape: 0
            }),
            protection
        );
    }
}
