import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedBlackboxMarket = await deploy("BlackboxMarket", {
    from: deployer,
    log: true,
  });

  console.log(`BlackboxMarket contract: `, deployedBlackboxMarket.address);
};
export default func;
func.id = "deploy_blackboxMarket"; // id required to prevent reexecution
func.tags = ["BlackboxMarket"];
