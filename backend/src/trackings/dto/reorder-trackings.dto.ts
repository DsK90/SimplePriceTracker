import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class ReorderTrackingsDto {
  /** All tracking ids for this user in the desired order (first = top of list). */
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  ids!: string[];
}
