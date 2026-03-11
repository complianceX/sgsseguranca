import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemTheme } from './entities/system-theme.entity';
import { SystemThemeService } from './system-theme.service';
import { SystemThemeController } from './system-theme.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SystemTheme])],
  controllers: [SystemThemeController],
  providers: [SystemThemeService],
  exports: [SystemThemeService],
})
export class SystemThemeModule {}
