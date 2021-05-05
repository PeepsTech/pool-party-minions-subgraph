import { SummonAavePartyMinion } from "../generated/AavePartyFactory/AaveFactory";
import { Minion, Protocol } from "../generated/schema";


export function handleSummonAaveparty(event: SummonAavePartyMinion): void {



  let minionId = (event.params.dao.toHex())
    .concat("-minion-")
    .concat(event.params.partyAddress.toHex());
  let minion = new Minion(minionId);

  minion.molochAddress = event.params.dao;
  minion.details = event.params.desc;
  minion.minionType = event.params.name;
  minion.minionAddress = event.params.partyAddress;
  minion.createdAt = event.block.timestamp.toString();

  minion.save();

  let protocol = new Protocol(event.params.protocol.toHex());

  protocol.protocolAddress = event.params.protocol;
  protocol.name = "Aave";
  protocol.minion = minionId;

  protocol.save()
}
