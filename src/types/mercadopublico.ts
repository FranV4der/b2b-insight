export interface Licitacion {
  CodigoExterno: string
  Nombre: string
  Descripcion: string
  CodigoEstado: number
  Estado: string
  FechaCierre: string
  FechaCreacion: string
  Comprador: {
    CodigoOrganismo: string
    NombreOrganismo: string
    RutUnidad: string
    CodigoUnidad: string
  }
  UnidadMoneda: string
  MontoEstimado: number
  TipoLicitacion: string
  CodigoTipo: string
}

export interface LicitacionResponse {
  Licitaciones: {
    Cantidad: number
    FechaCreacion: string
    Version: string
    Listado: {
      Licitacion: Licitacion
    }
  }
}
