import {Address, BigInt, ethereum} from '@graphprotocol/graph-ts'
import {LBPair, LiquidityPosition, User} from '../../generated/schema'
import {ADDRESS_ZERO, BIG_INT_ONE, BIG_INT_ZERO} from '../constants'
import {loadBin, loadUser} from '../entities'
import {getUserBinLiquidity} from './userBinLiquidity'

function getLiquidityPosition(
  lbPair: LBPair,
  user: User,
  block: ethereum.Block,
): LiquidityPosition {
  const id = lbPair.id.concat('-').concat(user.id)

  let liquidityPosition = LiquidityPosition.load(id)

  if (!liquidityPosition) {
    liquidityPosition = new LiquidityPosition(id)
    liquidityPosition.user = user.id
    liquidityPosition.lbPair = lbPair.id
    liquidityPosition.binsCount = BIG_INT_ZERO
    liquidityPosition.block = block.number.toI32()
    liquidityPosition.timestamp = block.timestamp.toI32()
    liquidityPosition.save()
  }

  return liquidityPosition as LiquidityPosition
}

export function addLiquidityPosition(
  lbPairAddr: Address,
  userAddr: Address,
  binId: BigInt,
  liquidity: BigInt,
  block: ethereum.Block,
): LiquidityPosition | null {
  // skip if 'userAddr' is zero address (mint transaction)
  if (userAddr.equals(ADDRESS_ZERO)) {
    return null
  }

  // skip if 'userAddr' is an LBPair address
  const tryLBPair = LBPair.load(userAddr.toHexString())
  if (tryLBPair) {
    return null
  }

  const lbPair = LBPair.load(lbPairAddr.toHexString())
  if (!lbPair) {
    return null
  }

  const user = loadUser(userAddr)
  const bin = loadBin(lbPair, binId.toU32())

  let liquidityPosition = getLiquidityPosition(lbPair, user, block)
  let userBinLiquidity = getUserBinLiquidity(
    liquidityPosition.id,
    lbPair,
    user,
    binId,
    block,
  )

  if (userBinLiquidity.liquidity.equals(BIG_INT_ZERO)) {
    // add user to list of bin's liquidity providers
    let liquidityProviders = bin.liquidityProviders
    liquidityProviders.push(user.id)
    bin.liquidityProviders = liquidityProviders
    bin.liquidityProviderCount = bin.liquidityProviderCount.plus(BIG_INT_ONE)
    bin.save()

    // increase count of bins user has liquidity
    liquidityPosition.binsCount = liquidityPosition.binsCount.plus(BIG_INT_ONE)

    // increase LBPair liquidityProviderCount if user now has one bin with liquidity
    if (liquidityPosition.binsCount.equals(BIG_INT_ONE)) {
      lbPair.liquidityProviderCount = lbPair.liquidityProviderCount.plus(
        BIG_INT_ONE,
      )
      lbPair.save()
    }
  }

  // update liquidity
  userBinLiquidity.liquidity = userBinLiquidity.liquidity.plus(liquidity)

  // update block and timestamp
  liquidityPosition.block = block.number.toI32()
  liquidityPosition.timestamp = block.timestamp.toI32()
  liquidityPosition.save()
  userBinLiquidity.block = block.number.toI32()
  userBinLiquidity.timestamp = block.timestamp.toI32()
  userBinLiquidity.save()

  return liquidityPosition as LiquidityPosition
}

export function removeLiquidityPosition(
  lbPairAddr: Address,
  userAddr: Address,
  binId: BigInt,
  liquidity: BigInt,
  block: ethereum.Block,
): LiquidityPosition | null {
  // skip if 'userAddr' is zero address (burn transaction)
  if (userAddr.equals(ADDRESS_ZERO)) {
    return null
  }

  // skip if 'userAddr' is an LBPair address
  const tryLBPair = LBPair.load(userAddr.toHexString())
  if (tryLBPair) {
    return null
  }

  const lbPair = LBPair.load(lbPairAddr.toHexString())
  if (!lbPair) {
    return null
  }

  const user = loadUser(userAddr)
  const bin = loadBin(lbPair, binId.toU32())

  let liquidityPosition = getLiquidityPosition(lbPair, user, block)
  let userBinLiquidity = getUserBinLiquidity(
    liquidityPosition.id,
    lbPair,
    user,
    binId,
    block,
  )

  // update liquidity
  userBinLiquidity.liquidity = userBinLiquidity.liquidity.minus(liquidity)

  if (userBinLiquidity.liquidity.le(BIG_INT_ZERO)) {
    // remove user from list of bin's liquidity providers
    let liquidityProviders = bin.liquidityProviders
    let idxToRemove = liquidityProviders.indexOf(user.id)
    if (idxToRemove > -1) {
      liquidityProviders.splice(idxToRemove, 1)
      bin.liquidityProviders = liquidityProviders
      bin.liquidityProviderCount = bin.liquidityProviderCount.minus(
        BIG_INT_ONE,
      )
      bin.save()
    }

    // decrease count of bins with user's liquidityPosition
    liquidityPosition.binsCount = liquidityPosition.binsCount.minus(
      BIG_INT_ONE,
    )

    // decrease LBPair liquidityProviderCount if user no longer has bins with liquidity
    if (liquidityPosition.binsCount.equals(BIG_INT_ZERO)) {
      lbPair.liquidityProviderCount = lbPair.liquidityProviderCount.minus(
        BIG_INT_ONE,
      )
      lbPair.save()
    }
  }

  // update block and timestamp
  liquidityPosition.block = block.number.toI32()
  liquidityPosition.timestamp = block.timestamp.toI32()
  liquidityPosition.save()
  userBinLiquidity.block = block.number.toI32()
  userBinLiquidity.timestamp = block.timestamp.toI32()
  userBinLiquidity.save()

  return liquidityPosition as LiquidityPosition
}
