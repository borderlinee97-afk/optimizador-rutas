export type PlacePrediction = {
  placeId: string
  text: string
  mainText: string
  secondaryText: string
  types: string[]
  distanceMeters: number | null
}

export type PlaceAutocompleteResponse = {
  predictions: PlacePrediction[]
}

export type SelectedPlace = {
  placeId: string | null
  name: string
  address: string | null
  lat: number
  lng: number
  types: string[]
}

export type PlaceDetailsResponse = {
  place: SelectedPlace
}