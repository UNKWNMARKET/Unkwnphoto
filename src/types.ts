export interface Photo {
  id: string;
  albumId: string;
  title: string;
  url: string;
  width?: number;
  height?: number;
  order: number;
  createdAt: string;
}

export interface Album {
  id: string;
  name: string;
  description: string;
  coverPhotoId?: string;
  order: number;
  createdAt: string;
}

export interface Library {
  version: number;
  albums: Album[];
  photos: Photo[];
}
