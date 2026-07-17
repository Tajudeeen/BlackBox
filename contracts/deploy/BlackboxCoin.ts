import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedBlackboxCoin = await deploy("BlackboxCoin", {
    from: deployer,
    log: true,
  });

  console.log(`BlackboxCoin contract: `, deployedBlackboxCoin.address);
};
export default func;
func.id = "deploy_blackboxCoin"; // id required to prevent reexecution
func.tags = ["BlackboxCoin"];
