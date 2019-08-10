import Taro, { useReducer, useMemo, useLayoutEffect, useEffect, eventCenter } from "@tarojs/taro"
import { Reducer } from "react"
import { AtTabBar, AtTabsPane, AtTabs } from "taro-ui"
import { View, Icon, Text } from "@tarojs/components"
import Modal from "@/components/Modal"
import { useStore, observer } from "@/store"
import WaybillStore from "@/store/WaybillStore"
import { useInit, useMutationEffect, useTest } from "@/utils/hooks"
import { isError } from "@/utils"
import NoData from "@/components/NoData"
import Card, { cardFormat, CardObj } from "./components/Card"
import ScrollViewEx from "./components/ScrollViewEx"
import { OrderType, IAction, WayBillType, OrderTypeMap, WayBillTypeMap } from "./types"
import RecommendPopup from "./components/RecommendPopup"
import FavCompanyPopup from "./components/FavCompanyPopup"
import "./waybill.less"

type WaybillHash = Partial<{
  type: string | null
  orderType: string | null
}>

interface IWaybillState {
  currentWaybillType: number
  currentOrderType: number
  isPopOpen: boolean
  isRefreshing: boolean
  isLoading: boolean
  isFavCompanyPopupOpen: boolean
  isRecommendPopupOpen: boolean
  isRecommendAfterCloseOpen: boolean
  hasMore: boolean
  cancelOrderNo: string
}

function getDayStr() {
  let d = new Date()
  return `${d.getMonth() + 1}-${d.getDate()}`
}
function reducer(state: IWaybillState, action: IAction) {
  console.log(action)
  const { type, payload } = action
  switch (type) {
    case "waybillTypeChange":
      return {
        ...state,
        currentWaybillType: payload,
        currentOrderType: 0,
      }
    case "showCancelModal":
      return {
        ...state,
        isPopOpen: true,
        cancelOrderNo: payload,
      }
    case "listUpdated":
    case "recommendPopupClose":
      return {
        ...state,
        ...payload,
      }
    default:
      return {
        ...state,
        [type]: payload,
      }
  }
}

function Waybill() {
  const hash: WaybillHash = this.$router.params

  const store = useStore<WaybillStore>("waybillStore")
  const {
    showGuide,
    homePopupList,
    orderList,
    orderListStatus,
    queryOrderList,
    getPopupInfo,
    setPopupReaded,
    pullWaybillOrder,
    cancelOrder,
    removeItemById,
  } = store

  const [state, dispatch] = useReducer<Reducer<IWaybillState, IAction>>(reducer, {
    currentWaybillType: parseInt(hash.type || "0"),
    currentOrderType: parseInt(hash.orderType || "0"),
    isPopOpen: false,
    isRefreshing: false,
    isLoading: false,
    hasMore: false,
    isRecommendPopupOpen: false,
    isRecommendAfterCloseOpen: false,
    isFavCompanyPopupOpen: false,
    cancelOrderNo: "",
  })
  const {
    currentWaybillType,
    currentOrderType,
    isPopOpen,
    isRecommendPopupOpen,
    isRecommendAfterCloseOpen,
    isRefreshing,
    isFavCompanyPopupOpen,
    isLoading,
    hasMore,
    cancelOrderNo,
  } = state

  // 运单类型
  const waybillTypeList = [WayBillType.Receipt, WayBillType.Ship]
  // 物流状态
  const orderTypeList = [
    OrderType.ALL,
    currentWaybillType == waybillTypeList.indexOf(WayBillType.Ship) && OrderType.WaitCollect,
    OrderType.Collect,
    OrderType.WaitPickup,
    OrderType.Received,
  ].filter(Boolean) as Array<OrderType>

  const cardList = useMemo(() => {
    return cardFormat(orderList)
  }, [orderList])

  const goQuery = () => {
    Taro.navigateTo({ url: "./waybillQuery" })
  }

  const onShowDetail = (obj: CardObj) => () => {
    Taro.navigateTo({ url: `./waybillDetail?orderNo=${obj.orderNo}&isShipWait=${obj.cancel ? 1 : 0}` })
  }

  const onCancelWaybill = orderNo => () => {
    dispatch({ type: "showCancelModal", payload: orderNo })
  }

  const onCancelConfirm = () => {
    dispatch({ type: "isPopOpen", payload: false })
    cancelOrder({
      orderNo: cancelOrderNo,
    }).then(e => {
      if (isError(e)) {
        Taro.showToast({
          title: e.error,
          icon: "none",
          duration: 1000,
        })
        return
      }
      Taro.showToast({
        title: "已删除",
        icon: "none",
        duration: 1000,
      })
      removeItemById(cancelOrderNo)
    })
  }

  const onRefresh = () => {
    dispatch({ type: "isRefreshing", payload: true })
    updateList()
  }

  const onFavCompanyConfirm = () => {
    Taro.navigateTo({
      url: `/pages/company/lists`,
    }).then(() => {
      closeFavCompanyPopup()
    })
  }
  const closeFavCompanyPopup = () => {
    setPopupReaded()
    dispatch({ type: "isFavCompanyPopupOpen", payload: false })
  }

  const onWaybillTypeClick = value => {
    if (currentWaybillType == value) return
    dispatch({ type: "waybillTypeChange", payload: value })
  }

  const updateList = (pageNum: number = 1) => {
    const params = {
      waybillType: WayBillTypeMap[waybillTypeList[currentWaybillType]],
      orderStatus: OrderTypeMap[orderTypeList[currentOrderType]],
      pageNum,
    }
    // 查询全部传空
    if (currentOrderType === orderTypeList.indexOf(OrderType.ALL)) {
      delete params.orderStatus
    }
    queryOrderList(params)
  }

  const fetchMoreData = () => {
    console.log("FetchMore:", orderListStatus)
    updateList(orderListStatus.pageNum + 1)
  }

  const navigateToCompany = () => {
    Taro.navigateTo({
      url: `/pages/company/select?redirect=companyList`,
    }).then(() => {
      dispatch({ type: "isRecommendPopupOpen", payload: false })
    })
  }

  useInit(() => {
    Taro.getSystemInfo().then(obj => {
      console.log("SystemInfo: ", obj)
    })
    getPopupInfo()
    eventCenter.on(`page.show.${this.constructor.name}`, () => {
      Taro.showTabBar()
    })
    eventCenter.on(`page.hide.${this.constructor.name}`, () => {
      Taro.hideLoading()
    })
    eventCenter.on("waybill.active", value => dispatch({ type: "waybillTypeChange", payload: value }))
  })

  // 更新时的提示  下拉刷新的时候就不出弹窗了 二选一
  useLayoutEffect(() => {
    dispatch({ type: "isLoading", payload: orderListStatus.isLoading })
    if (orderListStatus.isLoading) {
      if (!isRefreshing && orderListStatus.pageNum == 1) {
        Taro.showLoading({
          title: "加载中",
          mask: true,
        })
      }
    } else {
      Taro.hideLoading()
      dispatch({
        type: "listUpdated",
        payload: {
          isRefreshing: false,
          hasMore: orderListStatus.pageNum < Math.ceil(orderListStatus.listCount / orderListStatus.pageSize),
        },
      })
    }
  }, [orderListStatus.isLoading, isRefreshing, orderListStatus.pageNum])

  useMutationEffect(() => {
    updateList()
  }, [currentWaybillType, currentOrderType])

  useEffect(() => {
    if (homePopupList.length) {
      dispatch({ type: "isFavCompanyPopupOpen", payload: true })
    }
  }, [homePopupList])
  useEffect(() => {
    if (showGuide) {
      const ds = getDayStr()
      if (ds != Taro.getStorageSync("waybill.guide.lastday")) {
        dispatch({ type: "isRecommendPopupOpen", payload: true })
        Taro.setStorageSync("waybill.guide.lastday", ds)
      }
    }
  }, [showGuide])

  // useTest([currentWaybillType], [state, cardList])

  return (
    <View className='waybill'>
      <View className='tab-bar'>
        <AtTabBar
          tabList={waybillTypeList.map(i => ({ title: i }))}
          current={currentWaybillType}
          onClick={onWaybillTypeClick}
        />
      </View>
      <View className='filter-bar'>
        <AtTabs
          tabList={orderTypeList.map(i => ({ title: i }))}
          scroll
          current={currentOrderType}
          onClick={value => dispatch({ type: "currentOrderType", payload: value })}
        >
          {orderTypeList.map((_obj, ind) => {
            return (
              <AtTabsPane current={currentOrderType} className='tab-pane' index={ind} key={`${ind}`}>
                {currentOrderType == ind ? (
                  <ScrollViewEx
                    hasMore={hasMore}
                    offsetHeight={183}
                    onLoadMore={fetchMoreData}
                    onRefresh={onRefresh}
                    refreshing={isRefreshing}
                  >
                    {cardList.length == 0 && !isLoading && (
                      <View className='no-data'>
                        <NoData marginTop={41}>
                          <View>暂无该状态的运单记录哦~</View>
                          <View className='sub'>根据您所关注的物流公司自动查询运单</View>
                        </NoData>
                      </View>
                    )}
                    {cardList.map(cfg => (
                      <Card
                        data={cfg}
                        key={cfg.id}
                        onOk={onShowDetail(cfg)}
                        onCancel={onCancelWaybill(cfg.orderNo)}
                      ></Card>
                    ))}
                  </ScrollViewEx>
                ) : (
                  <View />
                )}
              </AtTabsPane>
            )
          })}
        </AtTabs>
        <View className='query-btn' onClick={goQuery}>
          <Icon size='15' type='search' />
          <Text className='text'>查询</Text>
        </View>
      </View>

      <Modal
        isOpened={isPopOpen}
        content='取消发货后，该运单将直接被删除'
        onConfirm={onCancelConfirm}
        onCancel={() => dispatch({ type: "isPopOpen", payload: false })}
      />

      <RecommendPopup
        isOpened={isRecommendPopupOpen}
        isAfterClose={isRecommendAfterCloseOpen}
        onOk={navigateToCompany}
        onCancel={() => {
          dispatch({
            type: "recommendPopupClose",
            payload: {
              isRecommendPopupOpen: false,
              isRecommendAfterCloseOpen: true,
            },
          })
        }}
      />

      <Modal
        isOpened={isRecommendAfterCloseOpen}
        cancelText=''
        confirmText='知道了'
        content='稍后可在我的-常用物流公司中设置您常用的物流公司。'
        onConfirm={() => {
          dispatch({ type: "isRecommendAfterCloseOpen", payload: false })
          Taro.showTabBar()
        }}
      />

      <FavCompanyPopup
        isOpened={isFavCompanyPopupOpen}
        list={homePopupList}
        onConfirm={onFavCompanyConfirm}
        onCancel={closeFavCompanyPopup}
      />
    </View>
  )
}

Waybill.config = {
  transparentTitle: "always",
}

export default observer(Waybill)
