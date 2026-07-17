import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, get } = hre.deployments;

  // BlackboxCoin must exist first -- its address is a constructor argument.
  // The "dependencies" field below guarantees deploy/BlackboxCoin.ts has
  // already run by the time this script executes, regardless of file
  // naming or alphabetical ordering.
  const blackboxCoin = await get("BlackboxCoin");

  const deployedBlackboxMarket = await deploy("BlackboxMarket", {
    from: deployer,
    args: [blackboxCoin.address],
    log: true,
  });

  console.log(`BlackboxMarket contract: `, deployedBlackboxMarket.address);
  console.log(`  using BlackboxCoin: `, blackboxCoin.address);
};
export default func;
func.id = "deploy_blackboxMarket"; // id required to prevent reexecution
func.tags = ["BlackboxMarket"];
func.dependencies = ["BlackboxCoin"];
