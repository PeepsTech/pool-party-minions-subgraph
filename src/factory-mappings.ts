import { SummonAavePartyMinion } from "../generated/AavePartyFactory/AaveFactory";
import { Minion, Protocol } from "../generated/schema";


export function handleAavePartySummon(event: SummonAavePartyMinion): void {

  let protocolId = event.params.partyAddress.toHexString()
  .concat("-protocol-")
  .concat(event.params.protocol.toString());
  let protocol = new Protocol(protocolId);

  let minionId = (event.params.dao.toHex())
  .concat("-minion-")
  .concat(event.params.partyAddress.toHex());
  let minion = new Minion(minionId);

  protocol.protocolAddress = event.params.protocol;
  protocol.name = "Aave";
  protocol.minion = minionId;

  protocol.save();

  minion.molochAddress = event.params.dao;
  minion.details = event.params.desc;
  minion.minionType = event.params.name;
  minion.minionAddress = event.params.partyAddress;
  minion.createdAt = event.block.timestamp.toString();
  minion.protocol = protocolId;

  minion.save();
  
}
