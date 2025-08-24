'use client'

import { useState, useEffect } from 'react'
import { useAccount, useConnect, useDisconnect, useSignMessage } from 'wagmi'
import { MetaMaskConnector } from 'wagmi/connectors/metaMask'
import { auth, db } from '../src/firebase'
import { signInWithCustomToken, onAuthStateChanged } from 'firebase/auth'
import { doc, setDoc, getDoc, collection, addDoc, query, where, getDocs, orderBy, limit } from 'firebase/firestore'
import toast from 'react-hot-toast'
import { ethers } from 'ethers'

const LOTTERY_LEVELS = [
  { id: 1, amount: 2, name: '2U 档' },
  { id: 2, amount: 10, name: '10U 档' },
]

export default function Home() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const [user, setUser] = useState(null)
  const [currentRounds, setCurrentRounds] = useState({ 2: null, 10: null })
  const [userTickets, setUserTickets] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedLevel, setSelectedLevel] = useState(null)
  const [okbPrice, setOkbPrice] = useState(0)
  const [priceLoading, setPriceLoading] = useState(true)

  // 获取OKB价格
  const fetchOKBPrice = async () => {
    try {
      setPriceLoading(true)
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=okb&vs_currencies=usd')
      const data = await response.json()
      
      if (data.okb && data.okb.usd) {
        setOkbPrice(data.okb.usd)
        console.log('OKB价格获取成功:', data.okb.usd)
      } else {
        console.warn('OKB价格数据格式错误:', data)
        setOkbPrice(1) // 默认价格
      }
    } catch (error) {
      console.error('获取OKB价格失败:', error)
      setOkbPrice(1) // 默认价格
    } finally {
      setPriceLoading(false)
    }
  }

  // 监听用户登录状态
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser(user)
        await loadUserData(user.uid)
      } else {
        setUser(null)
        setUserTickets([])
      }
    })

    return () => unsubscribe()
  }, [])

  // 钱包连接时自动登录
  useEffect(() => {
    if (isConnected && address && !user) {
      handleWalletLogin()
    }
  }, [isConnected, address, user])

  // 加载当前轮次和价格
  useEffect(() => {
    loadCurrentRounds()
    fetchOKBPrice()
    
    // 每5分钟更新一次价格
    const priceInterval = setInterval(fetchOKBPrice, 5 * 60 * 1000)
    
    return () => clearInterval(priceInterval)
  }, [])

  const handleWalletLogin = async () => {
    try {
      setLoading(true)
      
      // 这里应该调用你的后端 API 来获取 Firebase 自定义 token
      // 为了演示，我们直接使用钱包地址作为用户 ID
      const userRef = doc(db, 'users', address)
      await setDoc(userRef, {
        walletAddress: address,
        createdAt: new Date(),
        referralCode: generateReferralCode(),
      }, { merge: true })

      // 模拟 Firebase 认证
      setUser({ uid: address, walletAddress: address })
      
      toast.success('钱包连接成功！')
    } catch (error) {
      console.error('登录失败:', error)
      toast.error('登录失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const loadUserData = async (userId) => {
    try {
      // 加载用户奖券
      const ticketsQuery = query(
        collection(db, 'tickets'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(10)
      )
      const ticketsSnapshot = await getDocs(ticketsQuery)
      const tickets = ticketsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      setUserTickets(tickets)
    } catch (error) {
      console.error('加载用户数据失败:', error)
    }
  }

  const loadCurrentRounds = async () => {
    try {
      const rounds = { 2: null, 10: null }
      
      // 分别查找2U和10U档位的活跃轮次
      for (const level of [2, 10]) {
        const roundsQuery = query(
          collection(db, 'rounds'),
          where('status', '==', 'active'),
          where('level', '==', level),
          orderBy('createdAt', 'desc'),
          limit(1)
        )
        const roundsSnapshot = await getDocs(roundsQuery)
        
        if (!roundsSnapshot.empty) {
          const round = roundsSnapshot.docs[0]
          rounds[level] = {
            id: round.id,
            ...round.data()
          }
        } else {
          // 创建对应档位的新轮次
          await createNewRound(level)
          // 重新查询创建的轮次
          const newRoundsSnapshot = await getDocs(roundsQuery)
          if (!newRoundsSnapshot.empty) {
            const round = newRoundsSnapshot.docs[0]
            rounds[level] = {
              id: round.id,
              ...round.data()
            }
          }
        }
      }
      
      setCurrentRounds(rounds)
    } catch (error) {
      console.error('加载轮次失败:', error)
    }
  }

  const createNewRound = async (level) => {
    try {
      const roundRef = await addDoc(collection(db, 'rounds'), {
        status: 'active',
        level: level,
        participants: [],
        totalAmount: 0,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24小时后过期
      })
      
      console.log(`创建了${level}U档位的新轮次:`, roundRef.id)
    } catch (error) {
      console.error('创建轮次失败:', error)
    }
  }

  const buyTicket = async (level) => {
      if (!isConnected || !address) {
    toast.error('请先连接钱包')
    return
  }

    if (!user) {
      toast.error('请先登录')
      return
    }

    try {
      setLoading(true)
      setSelectedLevel(level)

      // 创建 OKB 转账交易
      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      
      // OKB代币合约地址（X Layer主网）
      const okbContractAddress = '0x4200000000000000000000000000000000000006'
      const projectWalletAddress = '0x520e3d52a7c9ba19d8dc606adb873cbf9419a031'
      
      // OKB代币合约ABI（只包含transfer函数）
      const okbContract = new ethers.Contract(okbContractAddress, [
        'function transfer(address to, uint256 amount) returns (bool)'
      ], signer)
      
      // 根据当前OKB价格计算需要支付的OKB数量
      const okbAmountUSD = level.amount // U金额
      const okbAmount = okbAmountUSD / okbPrice // 转换为OKB数量
      const okbWei = ethers.parseEther(okbAmount.toString())
      
      console.log(`${level.amount}U = ${okbAmount.toFixed(4)} OKB (价格: $${okbPrice})`)
      
      // 发送OKB转账
      const tx = await okbContract.transfer(projectWalletAddress, okbWei)
      const receipt = await tx.wait()
      const signature = receipt.hash

      // 记录购票
      await recordTicketPurchase(level, signature)

      toast.success(`成功购买 ${level.name} 奖券！支付 ${okbAmount.toFixed(4)} OKB`)
      await loadUserData(user.uid)
      await loadCurrentRounds()

    } catch (error) {
      console.error('购票失败:', error)
      toast.error('购票失败，请重试')
    } finally {
      setLoading(false)
      setSelectedLevel(null)
    }
  }

  const recordTicketPurchase = async (level, signature) => {
    try {
      // 记录奖券
      await addDoc(collection(db, 'tickets'), {
        userId: user.uid,
        walletAddress: address,
        level: level.id,
        amount: level.amount,
        transactionSignature: signature,
        createdAt: new Date(),
      })

      // 更新轮次参与者
      const currentRound = currentRounds[level.amount]
      if (currentRound) {
        const roundRef = doc(db, 'rounds', currentRound.id)
        const roundDoc = await getDoc(roundRef)
        
        if (roundDoc.exists()) {
          const roundData = roundDoc.data()
          const newParticipants = [...roundData.participants, {
            userId: user.uid,
            walletAddress: address,
            amount: level.amount,
            timestamp: new Date(),
          }]

          await setDoc(roundRef, {
            ...roundData,
            participants: newParticipants,
            totalAmount: roundData.totalAmount + level.amount,
          }, { merge: true })

          // 检查是否满员
          if (newParticipants.length >= 10) {
            await triggerLottery(roundRef.id)
          }
        }
      }
    } catch (error) {
      console.error('记录购票失败:', error)
    }
  }

  const triggerLottery = async (roundId) => {
    try {
      // 这里应该调用 Cloud Function 来处理开奖逻辑
      toast.success('轮次已满员，即将开奖！')
      
      // 更新轮次状态
      const roundRef = doc(db, 'rounds', roundId)
      await setDoc(roundRef, {
        status: 'completed',
        completedAt: new Date(),
      }, { merge: true })

      // 重新加载轮次
      await loadCurrentRounds()
    } catch (error) {
      console.error('开奖失败:', error)
    }
  }

  const generateReferralCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 导航栏 */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">抽奖应用</h1>
            </div>
            <div className="flex items-center space-x-4">
              {/* OKB价格显示 */}
              <div className="bg-gray-100 px-3 py-2 rounded-lg border">
                <span className="text-sm text-gray-600">OKB价格: </span>
                {priceLoading ? (
                  <span className="text-sm font-bold text-blue-600">加载中...</span>
                ) : (
                  <span className="text-sm font-bold text-blue-600">${okbPrice.toFixed(2)}</span>
                )}
              </div>
              
              {isConnected ? (
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-600">
                    {address?.slice(0, 6)}...{address?.slice(-4)}
                  </span>
                  <button
                    onClick={() => disconnect()}
                    className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                  >
                    断开连接
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => connect({ connector: connectors[0] })}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                  连接钱包
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* 主要内容 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 左侧：当前轮次信息 */}
          <div className="lg:col-span-2">
            <div className="space-y-6">
              <h2 className="text-2xl font-bold">当前轮次</h2>
              
              {/* 2U档位轮次 */}
              <div className="card">
                <h3 className="text-xl font-bold mb-4 text-blue-600">2U 档位</h3>
                
                {currentRounds[2] ? (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">轮次状态:</span>
                      <span className={`px-2 py-1 rounded text-sm ${
                        currentRounds[2].status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {currentRounds[2].status === 'active' ? '进行中' : '已结束'}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">参与人数:</span>
                      <span className="font-semibold">{currentRounds[2].participants?.length || 0}/10</span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">奖池金额:</span>
                      <span className="font-semibold text-lg text-primary">
                        {currentRounds[2].totalAmount || 0} U
                      </span>
                    </div>

                    {/* 进度条 */}
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min((currentRounds[2].participants?.length || 0) * 10, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500">加载中...</p>
                )}
              </div>

              {/* 10U档位轮次 */}
              <div className="card">
                <h3 className="text-xl font-bold mb-4 text-purple-600">10U 档位</h3>
                
                {currentRounds[10] ? (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">轮次状态:</span>
                      <span className={`px-2 py-1 rounded text-sm ${
                        currentRounds[10].status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {currentRounds[10].status === 'active' ? '进行中' : '已结束'}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">参与人数:</span>
                      <span className="font-semibold">{currentRounds[10].participants?.length || 0}/10</span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">奖池金额:</span>
                      <span className="font-semibold text-lg text-primary">
                        {currentRounds[10].totalAmount || 0} U
                      </span>
                    </div>

                    {/* 进度条 */}
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min((currentRounds[10].participants?.length || 0) * 10, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500">加载中...</p>
                )}
              </div>
            </div>

            {/* 购票区域 */}
            <div className="card mt-6">
              <h3 className="text-xl font-bold mb-4">选择档位购票</h3>
              
              {!isConnected ? (
                <div className="text-center py-8">
                  <p className="text-gray-600 mb-4">请先连接钱包</p>
                  <button
                    onClick={() => connect({ connector: connectors[0] })}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                  >
                    连接钱包
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {LOTTERY_LEVELS.map((level) => {
                    const currentRound = currentRounds[level.amount]
                    const isDisabled = loading || currentRound?.status !== 'active'
                    
                    return (
                      <button
                        key={level.id}
                        onClick={() => buyTicket(level)}
                        disabled={isDisabled}
                        className={`p-4 rounded-lg border-2 transition-all ${
                          loading && selectedLevel?.id === level.id
                            ? 'border-primary bg-primary text-white'
                            : level.amount === 2 
                              ? 'border-blue-200 hover:border-blue-600 hover:bg-blue-600 hover:text-white'
                              : 'border-purple-200 hover:border-purple-600 hover:bg-purple-600 hover:text-white'
                        } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <div className="text-center">
                          <div className="text-2xl font-bold">{level.amount}U</div>
                          <div className="text-sm">{level.name}</div>
                          {currentRound && (
                            <div className="text-xs mt-1">
                              {currentRound.participants?.length || 0}/10 人
                            </div>
                          )}
                          {loading && selectedLevel?.id === level.id && (
                            <div className="mt-2">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mx-auto"></div>
                            </div>
                          )}
                        </div>
                      </button>
                    )
                  })}
              )}
            </div>
          </div>

          {/* 右侧：用户信息 */}
          <div className="space-y-6">
            {/* 用户信息卡片 */}
            <div className="card">
              <h3 className="text-lg font-bold mb-4">我的信息</h3>
              
              {user ? (
                <div className="space-y-3">
                  <div>
                    <span className="text-gray-600">钱包地址:</span>
                    <p className="text-sm font-mono break-all">{user.walletAddress}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">我的奖券:</span>
                    <p className="font-semibold">{userTickets.length} 张</p>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500">未登录</p>
              )}
            </div>

            {/* 最近奖券 */}
            <div className="card">
              <h3 className="text-lg font-bold mb-4">最近奖券</h3>
              
              {userTickets.length > 0 ? (
                <div className="space-y-3">
                  {userTickets.slice(0, 5).map((ticket) => (
                    <div key={ticket.id} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                      <div>
                        <div className="font-semibold">{ticket.amount}U</div>
                        <div className="text-sm text-gray-600">
                          {new Date(ticket.createdAt.toDate()).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="text-sm text-gray-500">
                        {ticket.status || '待开奖'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">暂无奖券</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
