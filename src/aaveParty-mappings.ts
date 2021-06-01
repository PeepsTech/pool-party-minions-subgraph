import { BigInt,
         log,
         store,
         Address,
         Bytes,
         ByteArray,
         Result
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
         WithdrawToDAO, // done
         WithdrawToMinion, // done
         AaveParty} from "../generated/templates/AavePartyTemplate/AaveParty";

import { Minion, 
        Deposits, 
        Loans,
        Repayments, 
        Withdraws, 
        Protocol,
        Proposals,
        Tokens,
        Actions, 
        Members,
        Rewards } from "../generated/schema";

import { Erc20 } from "../generated/templates/AavePartyTemplate/Erc20";
import { Erc20Bytes32 } from "../generated/templates/AavePartyTemplate/Erc20Bytes32";


function getDAO(minionAddress: Bytes): Bytes {
  let contract = AaveParty.bind(minionAddress as Address);
  let result = contract.try_dao();
  if (result.reverted) {
    log.info("^^^^^ loadMoloch contract call reverted. moloch address: {}", [
      result.value.toString(),
    ]);
    return null;
  }

  return result.value;
}

function getProtocol(minionAddress: Bytes): Bytes {
  let contract = AaveParty.bind(minionAddress as Address);
  let result = contract.try_aavePool();
  if (result.reverted) {
    log.info("^^^^^ loadMoloch contract call reverted. aave address: {}", [
      result.value.toString(),
    ]);
    return null;
  }

  return result.value;
}

function getAToken(minionAddress: Bytes, token: Address): Bytes {
  let contract = AaveParty.bind(minionAddress as Address);
  let result = contract.try_getAaveTokenAddresses(token);
  return result.value.value0;
}

function getSToken(minionAddress: Bytes, token: Address): Bytes {
  let contract = AaveParty.bind(minionAddress as Address);
  let result = contract.try_getAaveTokenAddresses(token);
  return result.value.value1;
}

function getVToken(minionAddress: Bytes, token: Address): Bytes {
  let contract = AaveParty.bind(minionAddress as Address);
  let result = contract.try_getAaveTokenAddresses(token);
  return result.value.value2;
}

function getTokenSymbol(tokenAddress: Bytes): String {
  let contract = Erc20.bind(tokenAddress as Address);
  let symbol = contract.try_symbol();
  return symbol.value;
}

function loadOrCreateTokenBalance(
  minionId: string,
  thistoken: Bytes,
  protocolId: string
): Tokens | null {
  let minion = Minion.load(minionId);
  let TokenId = minion.minionAddress.toHexString().concat("-Token-").concat(thistoken.toHexString());
  let t = Tokens.load(TokenId);
  let tokenTokenDNE = t == null ? true : false;
  if (tokenTokenDNE) {
    let TokenId = minion.minionAddress.toHexString()
    .concat("-Token-")
    .concat(thistoken.toHexString());
    let t = new Tokens(TokenId);

    t.minion = minionId;
    t.tokenAddress = thistoken;
    t.balance = BigInt.fromI32(0);
    t.tokenSymbol = getTokenSymbol(thistoken).toString();
    t.rewardsOn = false;
    t.protocol = protocolId;

    t.save();
    return t;
  } else {
    return t;
  }
}

function addToToken(
  minionId: string,
  token: Bytes,
  amount: BigInt,
  protocolId: string
): string {
  let minion = Minion.load(minionId);
  let TokenId = minion.minionAddress.toHexString().concat("-Token-").concat(token.toHexString());
  let Token: Tokens | null = loadOrCreateTokenBalance(
    minionId,
    token,
    protocolId
  );
  Token.balance = Token.balance.plus(amount);
  Token.save();
  return TokenId;
}

function subtractFromToken(
  minionId: string,
  token: Bytes,
  amount: BigInt,
  protocolId: string
): string {
  let minion = Minion.load(minionId);
  let TokenId = minion.minionAddress.toHexString().concat("-Token-").concat(token.toHexString());
  let Token: Tokens | null = loadOrCreateTokenBalance(
    minionId,
    token,
    protocolId
  );
  Token.balance = Token.balance.minus(amount);
  Token.save();
  return TokenId;
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

  let tokens = withdraw.receiptToken;
  for (let i = 0; i < tokens.length; i++) {
    let token = Tokens.load(tokens[i]);
    addToToken(minionId, token.tokenAddress, withdraw.amount, withdraw.protocol);
  }
  
  let withdrawToken = Tokens.load(withdraw.withdrawToken);
  subtractFromToken(minionId, withdrawToken.tokenAddress, withdraw.amount, withdraw.protocol);

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

  if (action !== null){
    minion.earningsTokens.push(action.token);
  }

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

  let receiptToken = Tokens.load(deposit.recieptToken)
  addToToken(minionId, receiptToken.tokenAddress, deposit.amount, deposit.protocol);


  let tokens = deposit.depositToken;
  for (let i = 0; i < tokens.length; i++) {
    let token = Tokens.load(tokens[i]);
    subtractFromToken(minionId, token.tokenAddress, deposit.amount, deposit.protocol);
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
  
  subtractFromToken(minionId, event.params.token, event.params.earnings, minion.protocol)
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

  let receiptToken = Tokens.load(loan.receiptToken)
  addToToken(minionId, receiptToken.tokenAddress, loan.amount, loan.protocol);

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
    let receiptToken = loadOrCreateTokenBalance(minionId, event.params.token, protocolId)
    withdraw.receiptToken.push(receiptToken.toString());
  }

  let aTokenAddress = getAToken(event.address, event.params.token);
  let aToken = loadOrCreateTokenBalance(minionId, aTokenAddress, protocolId);

  withdraw.dao = molochAddress;
  withdraw.minion = minionId;
  withdraw.proposal = proposalId;
  withdraw.withdrawToken = aToken.toString();
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

  let depositId = minion.minionAddress.toHexString()
    .concat("-proposal-")
    .concat(event.params.proposalId.toString());

  let deposit = new Deposits(depositId); 
  log.info("Created new Withdraws => withdraw ID {}", [depositId]);

  let aTokenAddress = getAToken(event.address, event.params.token);
  let aToken = loadOrCreateTokenBalance(minionId, aTokenAddress, protocolId);

  let tokens = event.params.token;
  for (let i = 0; i < tokens.length; i++) {
    let newToken = loadOrCreateTokenBalance(minionId, event.params.token, protocolId)
    deposit.depositToken.push(newToken.toString());
  }

  deposit.dao = molochAddress;
  deposit.minion = minionId;
  deposit.proposal = proposalId;
  deposit.receiptToken = aToken.toString();
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

  let loanId = minion.minionAddress.toHexString()
    .concat("-proposal-")
    .concat(event.params.proposalId.toString());

  let loan = new Deposits(loanId); 
  log.info("Created new Withdraws => withdraw ID {}", [loanId]);

  if (event.params.rateMode == BigInt.fromI32(1)) {
    let sTokenAddress = getSToken(event.address, event.params.token);
    let sToken = loadOrCreateTokenBalance(minionId, sTokenAddress, protocolId);
    loan.receiptToken = sToken.toString();
  } else {
    let vTokenAddress = getVToken(event.address, event.params.token);
    let vToken = loadOrCreateTokenBalance(minionId, vTokenAddress, protocolId);
    loan.receiptToken = vToken.toString();
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

  let repayId = minion.minionAddress.toHexString()
    .concat("-proposal-")
    .concat(event.params.proposalId.toString());

  let repay = new Repayments(repayId); 
  log.info("Created new Withdraws => withdraw ID {}", [repayId]);

  if (event.params.rateMode == BigInt.fromI32(1)) {
    let sTokenAddress = getSToken(event.address, event.params.token);
    let sToken = loadOrCreateTokenBalance(minionId, sTokenAddress, protocolId);
    repay.paymentToken = sToken.toString();
  } else {
    let vTokenAddress = getVToken(event.address, event.params.token);
    let vToken = loadOrCreateTokenBalance(minionId, vTokenAddress, protocolId);
    repay.paymentToken = vToken.toString();
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

  let paymentToken = Tokens.load(repay.paymentToken)
  subtractFromToken(minionId, paymentToken.tokenAddress, repay.amount, repay.protocol);

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

  let proposalId = minion.minionAddress.toHexString()
    .concat("-proposal-")
    .concat(event.params.proposalId.toString());
  let proposal = Proposals.load(proposalId);

  proposal.proposer = event.params.proposer;
  proposal.canceled = false;
  proposal.executed = true;
  proposal.save();

  subtractFromToken(minionId, event.params.token, event.params.amount, protocolId);
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

  addToToken(minionId, event.params.token, event.params.amount, protocolId);

}


