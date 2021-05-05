import { BigInt,
         log,
         store,
         Address,
         Bytes,
         ByteArray,
        } from "@graphprotocol/graph-ts";

import { Canceled,
         CollateralWithdrawExecuted, // done
         DepositExecuted, // done
         EarningsToggled, // done
         EarningsWithdraw, // done 
         LoanExecuted, // done
         ProposeCollateralWithdraw, // done
         ProposeDeposit, // done
         ProposeLoan, // done 
         ProposeRepayLoan, // done
         ProposeToggleEarnings, // done
         RepayLoanExecuted, // done
         WithdrawToDAO,
         WithdrawToMinion,
         AaveParty} from "../generated/templates/AavePartyTemplate/AaveParty";

import { Minion, 
        Deposits, 
        Loans,
        Repayments, 
        Withdraws, 
        Protocol,
        Proposals,
        Balances,
        Actions, 
        Members,
        Rewards } from "../generated/schema";
import { forEach } from "core-js/core/array";


function getDAO(minionAddress: Bytes): Bytes | null {
  let contract = AaveParty.bind(minionAddress as Address);
  let result = contract.try_dao();
  if (result.reverted) {
    log.info("^^^^^ loadMoloch contract call reverted. moloch address: {}", [
      result.toString(),
    ]);
    return null;
  }

  return result.value;
}

function getProtocol(minionAddress: Bytes): Bytes | null {
  let contract = AaveParty.bind(minionAddress as Address);
  let result = contract.try_aavePool();
  if (result.reverted) {
    log.info("^^^^^ loadMoloch contract call reverted. aave address: {}", [
      result.toString(),
    ]);
    return null;
  }

  return result.value;
}

function getAToken(minionAddress: Bytes, token: Bytes): Bytes | null {
  let contract = AaveParty.bind(minionAddress as Address);
  let aTokens = {};
  aTokens[Symbol.iterator] = contract.try_getAaveTokenAddresses(token);
  let aToken = aTokens[0];
  return aToken.toString();
}

function getSToken(minionAddress: Bytes, token: Bytes): Bytes | null {
  let contract = AaveParty.bind(minionAddress as Address);
  let aTokens = {};
  aTokens[Symbol.iterator] = contract.try_getAaveTokenAddresses(token);
  let sToken = aTokens[1];
  return sToken;
}

function getVToken(minionAddress: Bytes, token: Bytes): Bytes | null {
  let contract = AaveParty.bind(minionAddress as Address);
  let aTokens = {};
  aTokens[Symbol.iterator] = contract.try_getAaveTokenAddresses(token);
  let vToken = aTokens[2];
  return vToken;
}



function loadOrCreateTokenBalance(
  minionId: string,
  token: Bytes,
  protocolId: string
): Balances | null {
  let minion = Minion.load(minionId);
  let balanceId = minion.minionAddress.toHexString().concat("-balance-").concat(token.toHexString());
  let tokenBalance = Balances.load(balanceId);
  let tokenBalanceDNE = tokenBalance == null ? true : false;
  if (tokenBalanceDNE) {
    let balanceId = minion.minionAddress.toHexString()
    .concat("-balance-")
    .concat(token.toHexString());
    let tokenBalance = new Balances(balanceId);

    tokenBalance.minion = minionId;
    tokenBalance.tokenAddress = token;
    tokenBalance.balance = BigInt.fromI32(0);
    tokenBalance.protocol = protocolId;

    tokenBalance.save();
    return tokenBalance;
  } else {
    return tokenBalance;
  }
}

function addToBalance(
  minionId: string,
  token: Bytes,
  amount: BigInt,
  protocolId: string
): string {
  let minion = Minion.load(minionId);
  let balanceId = minion.minionAddress.toHexString().concat("-balance-").concat(token.toHexString());
  let balance: Balances | null = loadOrCreateTokenBalance(
    minionId,
    token,
    protocolId
  );
  balance.balance = balance.balance.plus(amount);
  balance.save();
  return balanceId;
}

function subtractFromBalance(
  minionId: string,
  token: Bytes,
  amount: BigInt,
  protocolId: string
): string {
  let minion = Minion.load(minionId);
  let balanceId = minion.minionAddress.toHexString().concat("-balance-").concat(token.toHexString());
  let balance: Balances | null = loadOrCreateTokenBalance(
    minionId,
    token,
    protocolId
  );
  balance.balance = balance.balance.minus(amount);
  balance.save();
  return balanceId;
}

export function handleCancel(event: Canceled): void {
  let molochAddress = getDAO(event.address);
  if (molochAddress == null) {
    return;
  }
  
  let minionId = molochAddress
    .toHexString()
    .concat("-minion-")
    .concat(event.address.toHex());
  let minion = Minion.load(minionId);

  let proposalId = minion.minionAddress.toHexString()
    .concat("-proposal-")
    .concat(event.params.proposalId.toString());
  let proposal = Proposals.load(proposalId);

  proposal.canceled = true;
}

export function handleCollateralWithdrawEx(event: CollateralWithdrawExecuted): void {
  let molochAddress = getDAO(event.address);
  if (molochAddress == null) {
    return;
  }
  
  let minionId = molochAddress
    .toHexString()
    .concat("-minion-")
    .concat(event.address.toHex());
  let minion = Minion.load(minionId);

  let proposalId = minion.minionAddress.toHexString()
    .concat("-proposal-")
    .concat(event.params.proposalId.toString());
  let proposal = Proposals.load(proposalId);

  let withdrawId = minion.minionAddress.toHexString()
  .concat("-proposal-")
  .concat(event.params.proposalId.toString());
  let withdraw = Withdraws.load(withdrawId);

  for (let i = 0; i < withdraw.recieptToken.length; i++) {
    let token = withdraw.recieptToken[i];
    addToBalance(minionId, token, withdraw.amount, withdraw.protocol);
  }
  
  subtractFromBalance(minionId, withdraw.withdrawToken, withdraw.amount, withdraw.protocol);

  proposal.executed = true;
  proposal.save();
}

export function handleEarningsToggled(event: EarningsToggled): void {
  let molochAddress = getDAO(event.address);
  if (molochAddress == null) {
    return;
  }
  
  let minionId = molochAddress
    .toHexString()
    .concat("-minion-")
    .concat(event.address.toHex());
  let minion = Minion.load(minionId);

  let proposalId = minion.minionAddress.toHexString()
    .concat("-proposal-")
    .concat(event.params.proposalId.toString());
  let proposal = Proposals.load(proposalId);

  let actionId = minion.minionAddress.toHexString()
  .concat("-proposal-")
  .concat(event.params.proposalId.toString());
  let action = Actions.load(actionId);

  minion.earningsTokens.push(action.token);
  minion.save();

  proposal.executed = true;
  proposal.save();
}

export function handleDepositEx(event: DepositExecuted): void {
  let molochAddress = getDAO(event.address);
  if (molochAddress == null) {
    return;
  }
  
  let minionId = molochAddress
    .toHexString()
    .concat("-minion-")
    .concat(event.address.toHex());
  let minion = Minion.load(minionId);

  let proposalId = minion.minionAddress.toHexString()
    .concat("-proposal-")
    .concat(event.params.proposalId.toString());
  let proposal = Proposals.load(proposalId);

  let depositId = minion.minionAddress.toHexString()
  .concat("-proposal-")
  .concat(event.params.proposalId.toString());
  let deposit = Deposits.load(depositId);

  addToBalance(minionId, deposit.recieptToken, deposit.amount, deposit.protocol);

  for (let i = 0; i < deposit.depositToken.length; i++) {
    let token = deposit.depositToken[i];
    subtractFromBalance(minionId, token, deposit.amount, deposit.protocol);
  }

  proposal.executed = true;
  proposal.save();
}

export function handleEarningsWithdraw(event: EarningsWithdraw): void {
  let molochAddress = getDAO(event.address);
  if (molochAddress == null) {
    return;
  }
  
  let minionId = molochAddress
    .toHexString()
    .concat("-minion-")
    .concat(event.address.toHex());
  let minion = Minion.load(minionId);

  let potentialmemberId = minion.minionAddress
  .toHexString()
  .concat("-member-")
  .concat(event.params.member.toHexString());

  let member = Members.load(potentialmemberId);
  if (member !== null) {

    let potentialRewardsId = minion.minionAddress
    .toHexString()
    .concat("-rewards-")
    .concat(member.memberAddress
    .toHexString())
    .concat("-token-")
    .concat(event.params.token.toHexString());

    let rewards = Rewards.load(potentialRewardsId);

    if (rewards !== null) {
      rewards.amount = rewards.amount.plus(event.params.earnings);
      rewards.save()
    } else {

      let rewards = new Rewards(potentialRewardsId);
      rewards.minion = minionId;
      rewards.member = potentialmemberId;
      rewards.token = event.params.token;
      rewards.amount = event.params.earnings;
      rewards.save();
    }
  } else {

    let member = new Members(potentialmemberId);
    member.minion = minionId;
    member.memberAddress = event.params.member;
    member.save();


    let rewardsId = minion.minionAddress
    .toHexString()
    .concat("-rewards-")
    .concat(member.memberAddress
    .toHexString())
    .concat("-token-")
    .concat(event.params.token.toHexString());

    let rewards = new Rewards(rewardsId);
    rewards.minion = minionId;
    rewards.member = potentialmemberId;
    rewards.token = event.params.token;
    rewards.amount = event.params.earnings;
    rewards.save();

  }
  
  subtractFromBalance(minionId, event.params.token, event.params.earnings, minion.protocol)
}

export function handleLoanEx(event: LoanExecuted): void {
  let molochAddress = getDAO(event.address);
  if (molochAddress == null) {
    return;
  }
  
  let minionId = molochAddress
    .toHexString()
    .concat("-minion-")
    .concat(event.address.toHex());
  let minion = Minion.load(minionId);

  let proposalId = minion.minionAddress.toHexString()
    .concat("-proposal-")
    .concat(event.params.proposalId.toString());
  let proposal = Proposals.load(proposalId);

  let loanId = minion.minionAddress.toHexString()
  .concat("-proposal-")
  .concat(event.params.proposalId.toString());
  let loan = Loans.load(loanId);

  addToBalance(minionId, loan.recieptToken, loan.amount, loan.protocol);

  proposal.executed = true;
  proposal.save();
}

export function handlePropCollateralWithdraw(event: ProposeCollateralWithdraw): void {
  let molochAddress = getDAO(event.address);
  if (molochAddress == null) {
    return;
  }

  let protocolAddress = getProtocol(event.address);
  if (molochAddress == null) {
    return;
  }

  let aToken = getAToken(event.address, event.params.token);
  
  let minionId = molochAddress
    .toHexString()
    .concat("-minion-")
    .concat(event.address.toHex());
  let minion = Minion.load(minionId);

  let proposalId = minion.minionAddress.toHexString()
    .concat("-proposal-")
    .concat(event.params.proposalId.toString());
  let proposal = new Proposals(proposalId);
  log.info("Created new Proposal => proposal ID {}", [proposal.id]);

  proposal.minion = minionId;
  proposal.proposalId = event.params.proposalId;
  proposal.proposer = event.params.proposer;
  proposal.executed = false;
  proposal.canceled = false;
  proposal.save();

  let protocolId = minion.minionAddress.toHexString()
  .concat("-protocol-")
  .concat(protocolAddress.toString());
  let protocol = new Protocol(proposalId);

  protocol.protocolAddress = protocolAddress;
  protocol.minion = minionId;
  protocol.name = "Aave";
  protocol.save();

  let withdrawId = minion.minionAddress.toHexString()
    .concat("-proposal-")
    .concat(event.params.proposalId.toString());

  let withdraw = new Withdraws(withdrawId); 
  log.info("Created new Withdraws => withdraw ID {}", [withdrawId]);

  let tokens = event.params.token;
  for (let i = 0; i < tokens.length; i++) {
    withdraw.recieptToken.push(event.params.token);
  }

  withdraw.dao = molochAddress;
  withdraw.minion = minionId;
  withdraw.proposal = proposalId;
  withdraw.withdrawToken = aToken;
  withdraw.amount = event.params.amount;
  withdraw.protocol = protocolId;
  withdraw.details = "Proposal to withdraw ".concat(withdraw.withdrawToken.toString()).concat(withdraw.amount.toString());
  withdraw.save()
  
}

export function handlePropDeposit(event: ProposeDeposit): void {
  let molochAddress = getDAO(event.address);
  if (molochAddress == null) {
    return;
  }

  let protocolAddress = getProtocol(event.address);
  if (molochAddress == null) {
    return;
  }
  
  let minionId = molochAddress
    .toHexString()
    .concat("-minion-")
    .concat(event.address.toHex());
  let minion = Minion.load(minionId);

  let proposalId = minion.minionAddress.toHexString()
    .concat("-proposal-")
    .concat(event.params.proposalId.toString());
  let proposal = new Proposals(proposalId);
  log.info("Created new Proposal => proposal ID {}", [proposal.id]);

  proposal.minion = minionId;
  proposal.proposalId = event.params.proposalId;
  proposal.proposer = event.params.proposer;
  proposal.executed = false;
  proposal.canceled = false;
  proposal.save();

  let protocolId = minion.minionAddress.toHexString()
  .concat("-protocol-")
  .concat(protocolAddress.toString());
  let protocol = new Protocol(proposalId);

  protocol.protocolAddress = protocolAddress;
  protocol.minion = minionId;
  protocol.name = "Aave";
  protocol.save();

  let depositId = minion.minionAddress.toHexString()
    .concat("-proposal-")
    .concat(event.params.proposalId.toString());

  let deposit = new Deposits(depositId); 
  log.info("Created new Withdraws => withdraw ID {}", [depositId]);

  let aToken = getAToken(event.address, event.params.token);

  let tokens = event.params.token;
  for (let i = 0; i < tokens.length; i++) {
    deposit.depositToken.push(event.params.token);
  }

  deposit.dao = molochAddress;
  deposit.minion = minionId;
  deposit.proposal = proposalId;
  deposit.recieptToken = aToken;
  deposit.amount = event.params.amount;
  deposit.protocol = protocolId;
  deposit.details = "Proposal to withdraw ".concat(deposit.depositToken.toString()).concat(deposit.amount.toString());
  deposit.save()
  
}

export function handlePropLoan(event: ProposeLoan): void {
  let molochAddress = getDAO(event.address);
  if (molochAddress == null) {
    return;
  }

  let protocolAddress = getProtocol(event.address);
  if (molochAddress == null) {
    return;
  }
  
  let minionId = molochAddress
    .toHexString()
    .concat("-minion-")
    .concat(event.address.toHex());
  let minion = Minion.load(minionId);

  let proposalId = minion.minionAddress.toHexString()
    .concat("-proposal-")
    .concat(event.params.proposalId.toString());
  let proposal = new Proposals(proposalId);
  log.info("Created new Proposal => proposal ID {}", [proposal.id]);

  proposal.minion = minionId;
  proposal.proposalId = event.params.proposalId;
  proposal.proposer = event.params.proposer;
  proposal.executed = false;
  proposal.canceled = false;
  proposal.save();

  let protocolId = minion.minionAddress.toHexString()
  .concat("-protocol-")
  .concat(protocolAddress.toString());
  let protocol = new Protocol(proposalId);

  protocol.protocolAddress = protocolAddress;
  protocol.minion = minionId;
  protocol.name = "Aave";
  protocol.save();

  let loanId = minion.minionAddress.toHexString()
    .concat("-proposal-")
    .concat(event.params.proposalId.toString());

  let loan = new Deposits(loanId); 
  log.info("Created new Withdraws => withdraw ID {}", [loanId]);

  if (event.params.rateMode == BigInt.fromI32(1)) {
    let sToken = getSToken(event.address, event.params.token);
    loan.recieptToken = sToken;
  } else if (event.params.rateMode == BigInt.fromI32(2)) {
    let vToken = getVToken(event.address, event.params.token);
    loan.recieptToken = vToken;
  } else {
    return null;
  }

  loan.dao = molochAddress;
  loan.minion = minionId;
  loan.proposal = proposalId;
  loan.amount = event.params.amount;
  loan.protocol = protocolId;
  loan.details = "Proposal to get loan ".concat(event.params.token.toString()).concat(loan.amount.toString());
  loan.save()
  
}

export function handlePropRepayLoan(event: ProposeRepayLoan): void {
  let molochAddress = getDAO(event.address);
  if (molochAddress == null) {
    return;
  }

  let protocolAddress = getProtocol(event.address);
  if (molochAddress == null) {
    return;
  }
  
  let minionId = molochAddress
    .toHexString()
    .concat("-minion-")
    .concat(event.address.toHex());
  let minion = Minion.load(minionId);

  let proposalId = minion.minionAddress.toHexString()
    .concat("-proposal-")
    .concat(event.params.proposalId.toString());
  let proposal = new Proposals(proposalId);
  log.info("Created new Proposal => proposal ID {}", [proposal.id]);

  proposal.minion = minionId;
  proposal.proposalId = event.params.proposalId;
  proposal.proposer = event.params.proposer;
  proposal.executed = false;
  proposal.canceled = false;
  proposal.save();

  let protocolId = minion.minionAddress.toHexString()
  .concat("-protocol-")
  .concat(protocolAddress.toString());
  let protocol = new Protocol(proposalId);

  protocol.protocolAddress = protocolAddress;
  protocol.minion = minionId;
  protocol.name = "Aave";
  protocol.save();

  let repayId = minion.minionAddress.toHexString()
    .concat("-proposal-")
    .concat(event.params.proposalId.toString());

  let repay = new Repayments(repayId); 
  log.info("Created new Withdraws => withdraw ID {}", [repayId]);

  if (event.params.rateMode == BigInt.fromI32(1)) {
    let sToken = getSToken(event.address, event.params.token);
    repay.paymentToken = sToken;
  } else if (event.params.rateMode == BigInt.fromI32(2)) {
    let vToken = getVToken(event.address, event.params.token);
    repay.paymentToken = vToken;
  } else {
    return null;
  }

  repay.dao = molochAddress;
  repay.minion = minionId;
  repay.proposal = proposalId;
  repay.amount = event.params.amount;
  repay.protocol = protocolId;
  repay.details = "Proposal to repay loan ".concat(event.params.token.toString()).concat(repay.amount.toString());
  repay.save()
  
}

export function handlePropEarningsToggled(event: ProposeToggleEarnings): void {
  let molochAddress = getDAO(event.address);
  if (molochAddress == null) {
    return;
  }

  let protocolAddress = getProtocol(event.address);
  if (molochAddress == null) {
    return;
  }
  
  let minionId = molochAddress
    .toHexString()
    .concat("-minion-")
    .concat(event.address.toHex());
  let minion = Minion.load(minionId);

  let protocolId = minion.minionAddress.toHexString()
  .concat("-protocol-")
  .concat(protocolAddress.toString());
  let protocol = new Protocol(protocolId);

  protocol.protocolAddress = protocolAddress;
  protocol.minion = minionId;
  protocol.name = "Aave";
  protocol.save();

  let proposalId = minion.minionAddress.toHexString()
    .concat("-proposal-")
    .concat(event.params.proposalId.toString());
  let proposal = Proposals.load(proposalId);

  proposal.proposer = event.params.proposer;
  proposal.canceled = false;
  proposal.executed = false;
  proposal.save();

  let actionId = minion.minionAddress.toHexString()
  .concat("-proposal-")
  .concat(event.params.proposalId.toString());
  let action = Actions.load(actionId);

  action.dao = molochAddress;
  action.minion = minionId;
  action.token = event.params.token;
  action.proposal = proposalId;
  action.protocol = protocolId;
  action.save();

  minion.save();
 
}

export function handleRepayLoanEx(event: RepayLoanExecuted): void {
  let molochAddress = getDAO(event.address);
  if (molochAddress == null) {
    return;
  }
  
  let minionId = molochAddress
    .toHexString()
    .concat("-minion-")
    .concat(event.address.toHex());
  let minion = Minion.load(minionId);

  let proposalId = minion.minionAddress.toHexString()
    .concat("-proposal-")
    .concat(event.params.proposalId.toString());
  let proposal = Proposals.load(proposalId);

  let repayId = minion.minionAddress.toHexString()
  .concat("-proposal-")
  .concat(event.params.proposalId.toString());
  let repay = Repayments.load(repayId);

  subtractFromBalance(minionId, repay.paymentToken, repay.amount, repay.protocol);

  proposal.executed = true;
  proposal.save();
}

export function handleWithdrawToDAO(event: WithdrawToDAO): void {
  let molochAddress = getDAO(event.address);
  if (molochAddress == null) {
    return;
  }

  let protocolAddress = getProtocol(event.address);
  if (molochAddress == null) {
    return;
  }
  
  let minionId = molochAddress
    .toHexString()
    .concat("-minion-")
    .concat(event.address.toHex());
  let minion = Minion.load(minionId);

  let protocolId = minion.minionAddress.toHexString()
  .concat("-protocol-")
  .concat(protocolAddress.toString());
  let protocol = new Protocol(protocolId);

  protocol.protocolAddress = protocolAddress;
  protocol.minion = minionId;
  protocol.name = "Aave";
  protocol.save();

  let proposalId = minion.minionAddress.toHexString()
    .concat("-proposal-")
    .concat(event.params.proposalId.toString());
  let proposal = Proposals.load(proposalId);

  proposal.proposer = event.params.proposer;
  proposal.canceled = false;
  proposal.executed = true;
  proposal.save();

  subtractFromBalance(minionId, event.params.token, event.params.amount, protocolId);

}

export function handleWithdrawToMinion(event: WithdrawToMinion): void {
  let molochAddress = getDAO(event.address);
  if (molochAddress == null) {
    return;
  }

  let protocolAddress = getProtocol(event.address);
  if (molochAddress == null) {
    return;
  }
  
  let minionId = molochAddress
    .toHexString()
    .concat("-minion-")
    .concat(event.address.toHex());
  let minion = Minion.load(minionId);

  let protocolId = minion.minionAddress.toHexString()
  .concat("-protocol-")
  .concat(protocolAddress.toString());
  let protocol = new Protocol(protocolId);

  protocol.protocolAddress = protocolAddress;
  protocol.minion = minionId;
  protocol.name = "Aave";
  protocol.save();

  addToBalance(minionId, event.params.token, event.params.amount, protocolId);

}


