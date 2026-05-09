import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { Site } from '../sites/entities/site.entity';
import { User } from '../users/entities/user.entity';
import { ExpenseAdvance } from './entities/expense-advance.entity';
import { ExpenseItem } from './entities/expense-item.entity';
import { ExpenseReport } from './entities/expense-report.entity';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExpenseReport,
      ExpenseAdvance,
      ExpenseItem,
      Site,
      User,
    ]),
    CommonModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
